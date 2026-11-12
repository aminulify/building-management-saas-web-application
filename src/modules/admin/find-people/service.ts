import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { requireRole } from "@/lib/authz/authorize";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import { isOnline } from "@/modules/messaging/access";
import type { Actor } from "@/lib/auth/require-actor";
import { accountState } from "../owners/service";
import { addressText } from "../shared/document-review";
import { allAmenities } from "../properties/amenities";
import { classify, hasKind } from "./logic";

/**
 * Super Admin → Find People: one search box for an NID number, e-mail, phone, account ID (OW…, TN…, TF…), username or uuid.
 * Exact matches only (nothing is browsable), rate limited and audit-logged; the search text itself is never logged.
 */
const KINDS = ["OWNER", "TENANT", "GENERAL_USER"] as const;
export const findQuery = z.object({ q: z.string().trim().min(3).max(120) });

const card = { id: true, role: true, fullName: true, username: true, ownerCode: true, tenantCode: true, email: true, phone: true, verificationStatus: true, status: true, archivedAt: true, lastSeenAt: true, avatarKey: true, nidLast4: true } as const;

export async function findPeople(actor: Actor, input: z.infer<typeof findQuery>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  rateLimit(`find-people:${actor.id}`, 30, 60_000);
  const k = classify(input.q);
  if (!hasKind(k)) { await writeAudit({ actor, action: "people.search", resourceType: "User", after: { kinds: [], found: 0 }, req }); return { items: [], matchedBy: [] as string[] }; }
  const or: Prisma.UserWhereInput[] = [];
  if (k.id) or.push({ id: k.id });
  if (k.email) or.push({ email: k.email });
  if (k.phone) or.push({ phone: k.phone });
  if (k.nid) or.push({ nidHash: sha256(k.nid) });
  if (k.code) or.push({ ownerCode: k.code }, { tenantCode: k.code });
  if (k.username) or.push({ username: { equals: k.username, mode: "insensitive" } });
  const rows = await db.user.findMany({ where: { role: { in: [...KINDS] }, OR: or }, select: card, take: 10, orderBy: { id: "desc" } });
  await writeAudit({ actor, action: "people.search", resourceType: "User", resourceId: rows.length === 1 ? rows[0]!.id : undefined, after: { kinds: Object.keys(k), found: rows.length }, req });
  const avatars = await signStorageKeys(rows.flatMap((r) => (r.avatarKey ? [r.avatarKey] : [])), 3600);
  return {
    matchedBy: Object.keys(k),
    items: rows.map(({ avatarKey, nidLast4, lastSeenAt, archivedAt, ...u }) => ({
      ...u, nid: nidLast4 ? `•••••••••${nidLast4}` : null, nidVerified: u.verificationStatus === "VERIFIED", archived: !!archivedAt, online: isOnline(lastSeenAt), avatarUrl: avatarKey ? avatars.get(avatarKey) ?? null : null,
    })),
  };
}

const listingRow = (l: { id: string; title: string; price: Prisma.Decimal; status: string; category: string; district: string | null; upazila: string | null; createdAt: Date }) => ({ id: l.id, title: l.title, price: l.price.toString(), status: l.status, category: l.category, location: [l.upazila, l.district].filter(Boolean).join(", "), createdAt: l.createdAt });

/** "Cities: Dhaka · Rent 20000–40000" from a saved search filter (the filter is free-form JSON). */
function summarize(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  return Object.entries(query as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
}

/** Everything the profile window shows: the header, then the part that fits the role (owner, tenant or Tenant Free). The full NID is shown and the view is audit-logged. */
export async function personFull(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  rateLimit(`find-people-view:${actor.id}`, 60, 60_000);
  const u = await db.user.findFirst({
    where: { id, role: { in: [...KINDS] } },
    select: {
      ...card, gender: true, occupation: true, dateOfBirth: true, nid: true, createdAt: true, warnedAt: true, archiveReason: true,
      address: { select: { division: true, district: true, upazila: true, union: true, street: true, postOffice: true } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND");
  await writeAudit({ actor, action: "user.nid_view", resourceType: "User", resourceId: id, after: { via: "find_people" }, req });
  const avatarUrl = u.avatarKey ? await signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : null;
  const { avatarKey, nidLast4, lastSeenAt, archivedAt, status, warnedAt, address, ...rest } = u;
  const head = { ...rest, avatarUrl, nidLast4, online: isOnline(lastSeenAt), lastSeenAt, archived: !!archivedAt, state: accountState({ status, warnedAt }), accountStatus: status, address: addressText(address) };
  const log = await db.accountStatusLog.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 50, select: { id: true, action: true, comment: true, adminUsername: true, createdAt: true } });

  if (u.role === "OWNER") {
    const [plan, props, unitGroups, leases, listings, saleRows, unitRows] = await Promise.all([
      db.userSubscription.findFirst({ where: { userId: id, audience: "OWNER" }, orderBy: { createdAt: "desc" }, select: { status: true, cycle: true, endsAt: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } }),
      db.property.findMany({ where: { ownerId: id, archivedAt: null }, orderBy: { id: "desc" }, take: 100, select: { id: true, name: true, type: true, status: true, declaredUnits: true, locationText: true, address: { select: { upazila: true, district: true } }, _count: { select: { units: { where: { archivedAt: null } } } } } }),
      db.unit.groupBy({ by: ["availability"], where: { archivedAt: null, property: { ownerId: id, archivedAt: null } }, _count: { _all: true } }),
      db.rentalAgreement.findMany({ where: { ownerId: id, status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 100, select: { id: true, tenantId: true, unitId: true, rent: true, startDate: true, endDate: true, unit: { select: { unitNumber: true, property: { select: { id: true, name: true } } } } } }),
      db.listing.count({ where: { sellerId: id, status: "PUBLISHED" } }),
      db.listing.findMany({ where: { sellerId: id, type: "SALE", status: { in: ["PUBLISHED", "SOLD"] } }, orderBy: { id: "desc" }, take: 100, select: { id: true, title: true, price: true, status: true, category: true, district: true, upazila: true, createdAt: true } }),
      db.unit.findMany({ where: { archivedAt: null, property: { ownerId: id, archivedAt: null } }, orderBy: [{ propertyId: "asc" }, { floor: "asc" }, { unitNumber: "asc" }], take: 400, select: { id: true, unitNumber: true, floor: true, bedrooms: true, rent: true, availability: true, property: { select: { id: true, name: true } } } }),
    ]);
    const tenants = await db.user.findMany({ where: { id: { in: leases.map((l) => l.tenantId) } }, select: { id: true, fullName: true, tenantCode: true, phone: true } });
    const n = (a: string) => unitGroups.find((g) => g.availability === a)?._count._all ?? 0;
    return {
      ...head, log, listings,
      owner: {
        plan: plan ? { code: plan.plan.code, nameEn: plan.plan.nameEn, nameBn: plan.plan.nameBn, status: plan.status, cycle: plan.cycle, endsAt: plan.endsAt } : null,
        units: { total: n("AVAILABLE") + n("OCCUPIED") + n("MAINTENANCE"), occupied: n("OCCUPIED"), vacant: n("AVAILABLE"), maintenance: n("MAINTENANCE") },
        forSale: saleRows.filter((l) => l.status === "PUBLISHED").map(listingRow), sold: saleRows.filter((l) => l.status === "SOLD").map(listingRow),
        unitList: unitRows.map((u) => { const lease = leases.find((l) => l.unitId === u.id); return { id: u.id, unitNumber: u.unitNumber, floor: u.floor, bedrooms: u.bedrooms, rent: u.rent.toString(), availability: u.availability, property: u.property.name, propertyId: u.property.id, tenant: lease ? tenants.find((x) => x.id === lease.tenantId)?.fullName ?? null : null }; }),
        properties: props.map((p) => ({ id: p.id, name: p.name, type: p.type, status: p.status, units: Math.max(p.declaredUnits ?? 0, p._count.units), location: p.locationText || [p.address?.upazila, p.address?.district].filter(Boolean).join(", ") })),
        tenants: leases.map((l) => { const t = tenants.find((x) => x.id === l.tenantId); return { id: l.tenantId, name: t?.fullName ?? "", code: t?.tenantCode ?? null, phone: t?.phone ?? null, property: l.unit.property.name, propertyId: l.unit.property.id, unitId: l.unitId, unit: l.unit.unitNumber, rent: l.rent.toString(), since: l.startDate }; }),
      },
      tenant: null, free: null,
    };
  }

  if (u.role === "TENANT") {
    const [lease, previous] = await Promise.all([
      db.rentalAgreement.findFirst({
        where: { tenantId: id, status: "ACTIVE" }, orderBy: { startDate: "desc" },
        select: { id: true, ownerId: true, unitId: true, rent: true, deposit: true, startDate: true, endDate: true, members: true, noticeGivenAt: true, unit: { select: { unitNumber: true, floor: true, property: { select: { id: true, name: true, locationText: true, address: { select: { upazila: true, district: true } } } } } } },
      }),
      db.rentalAgreement.count({ where: { tenantId: id, status: { in: ["ENDED", "TERMINATED"] } } }),
    ]);
    const [landlord, records] = lease
      ? await Promise.all([
        db.user.findUnique({ where: { id: lease.ownerId }, select: { id: true, fullName: true, ownerCode: true, email: true, phone: true } }),
        db.rentRecord.findMany({ where: { agreementId: lease.id }, orderBy: { billingMonth: "desc" }, take: 24, select: { id: true, billingMonth: true, total: true, paid: true, status: true, dueDate: true } }),
      ])
      : [null, []];
    const p = lease?.unit.property;
    return {
      ...head, log, listings: 0, owner: null, free: null,
      tenant: {
        previousTenancies: previous,
        residence: lease ? { propertyId: p!.id, unitId: lease.unitId, property: p!.name, unit: lease.unit.unitNumber, floor: lease.unit.floor, location: p!.locationText || [p!.address?.upazila, p!.address?.district].filter(Boolean).join(", "), rent: lease.rent.toString(), deposit: lease.deposit.toString(), startDate: lease.startDate, endDate: lease.endDate, members: lease.members, noticeGiven: !!lease.noticeGivenAt } : null,
        landlord, ledger: records.map((r) => ({ id: r.id, month: r.billingMonth, total: r.total.toString(), paid: r.paid.toString(), status: r.status, dueDate: r.dueDate })),
      },
    };
  }

  const [favorites, favCount, searches, searchCount, upgrade] = await Promise.all([
    db.favorite.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, listing: { select: { id: true, title: true, type: true, category: true, price: true, status: true, district: true, upazila: true } } } }),
    db.favorite.count({ where: { userId: id } }),
    db.savedSearch.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, query: true, createdAt: true } }),
    db.savedSearch.count({ where: { userId: id } }),
    db.upgradeRequest.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { status: true, toRole: true, cycle: true, expectedAmount: true, rejectionReason: true, createdAt: true, plan: { select: { nameEn: true, nameBn: true } } } }),
  ]);
  return {
    ...head, log, listings: 0, owner: null, tenant: null,
    free: {
      favoriteCount: favCount, searchCount,
      favorites: favorites.map((f) => ({ id: f.id, listingId: f.listing.id, savedAt: f.createdAt, title: f.listing.title, type: f.listing.type, category: f.listing.category, price: f.listing.price.toString(), status: f.listing.status, location: [f.listing.upazila, f.listing.district].filter(Boolean).join(", ") })),
      searches: searches.map((s) => ({ id: s.id, at: s.createdAt, summary: summarize(s.query) })),
      upgrade: upgrade ? { status: upgrade.status, toRole: upgrade.toRole, cycle: upgrade.cycle, amount: upgrade.expectedAmount.toString(), rejectionReason: upgrade.rejectionReason, at: upgrade.createdAt, planEn: upgrade.plan.nameEn, planBn: upgrade.plan.nameBn } : null,
    },
  };
}

const photoUrls = (keys: string[]) => Promise.all(keys.map((k) => signStorageKey(k, 3600).then((r) => r.url).catch(() => null))).then((x) => x.filter((u): u is string => !!u));

/** One property with everything: details, owner, photos, amenities, occupancy and every unit with its tenant. */
export async function propertyFull(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({
    where: { id, owner: { role: { in: [...KINDS] } } },
    include: {
      address: true, owner: { select: { id: true, fullName: true, ownerCode: true, email: true, phone: true } },
      images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 8, select: { storageKey: true } },
      units: { where: { archivedAt: null }, orderBy: [{ floor: "asc" }, { unitNumber: "asc" }], take: 400, select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, rent: true, availability: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const leases = await db.rentalAgreement.findMany({ where: { status: "ACTIVE", unitId: { in: p.units.map((u) => u.id) } }, select: { unitId: true, tenantId: true } });
  const people = await db.user.findMany({ where: { id: { in: leases.map((l) => l.tenantId) } }, select: { id: true, fullName: true, tenantCode: true } });
  const tenantOf = (unitId: string) => { const l = leases.find((x) => x.unitId === unitId); const t = l && people.find((x) => x.id === l.tenantId); return t ? { id: t.id, name: t.fullName, code: t.tenantCode } : null; };
  const occupied = p.units.filter((u) => u.availability === "OCCUPIED").length;
  const repair = p.units.filter((u) => u.availability === "MAINTENANCE").length;
  return {
    id: p.id, name: p.name, type: p.type, description: p.description, status: p.status, verificationStatus: p.verificationStatus, totalFloors: p.totalFloors, totalSqft: p.totalSqft, createdAt: p.createdAt,
    archived: !!p.archivedAt, archiveReason: p.archiveReason, location: p.locationText || addressText(p.address), amenities: allAmenities(p.amenities, p.securityFeatures),
    owner: p.owner, photos: await photoUrls(p.images.map((i) => i.storageKey)),
    totals: { units: p.units.length, occupied, repair, vacant: Math.max(0, p.units.length - occupied - repair) },
    units: p.units.map((u) => ({ ...u, rent: u.rent.toString(), tenant: tenantOf(u.id) })),
  };
}

/** One marketplace listing (for sale, rent, sold …) with the seller, photos and the full description. */
export async function listingFull(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({
    where: { id, seller: { role: { in: [...KINDS] } } },
    include: { seller: { select: { id: true, fullName: true, ownerCode: true, email: true, phone: true } }, images: { orderBy: { order: "asc" }, take: 8, select: { storageKey: true } }, property: { select: { id: true, name: true } } },
  });
  if (!l) throw new AppError("NOT_FOUND");
  const { images, price, area, seller, property, ...rest } = l;
  return {
    id: rest.id, title: rest.title, type: rest.type, category: rest.category, status: rest.status, description: rest.description, negotiable: rest.negotiable, isFeatured: rest.isFeatured,
    bedrooms: rest.bedrooms, bathrooms: rest.bathrooms, floor: rest.floor, totalFloors: rest.totalFloors, areaUnit: rest.areaUnit, createdAt: rest.createdAt, updatedAt: rest.updatedAt,
    price: price.toString(), area: area?.toString() ?? null, location: rest.fullAddress || [rest.upazila, rest.district].filter(Boolean).join(", "), seller, property,
    photos: await photoUrls(images.map((i) => i.storageKey)),
  };
}

/** One unit: its specs, the tenant living in it with the lease, the latest rent months and the repair tickets. */
export async function unitFull(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.unit.findFirst({
    where: { id, property: { owner: { role: { in: [...KINDS] } } } },
    include: { property: { select: { id: true, name: true, locationText: true, address: { select: { upazila: true, district: true } }, owner: { select: { id: true, fullName: true, ownerCode: true, email: true, phone: true } } } } },
  });
  if (!u) throw new AppError("NOT_FOUND");
  const [lease, previous, openTickets, allTickets] = await Promise.all([
    db.rentalAgreement.findFirst({ where: { unitId: id, status: "ACTIVE" }, orderBy: { startDate: "desc" }, select: { id: true, tenantId: true, rent: true, deposit: true, startDate: true, endDate: true, members: true, noticeGivenAt: true } }),
    db.rentalAgreement.count({ where: { unitId: id, status: { in: ["ENDED", "TERMINATED"] } } }),
    db.maintenanceRequest.count({ where: { unitId: id, status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } } }),
    db.maintenanceRequest.count({ where: { unitId: id } }),
  ]);
  const [tenant, ledger] = lease
    ? await Promise.all([
      db.user.findUnique({ where: { id: lease.tenantId }, select: { id: true, fullName: true, tenantCode: true, email: true, phone: true } }),
      db.rentRecord.findMany({ where: { agreementId: lease.id }, orderBy: { billingMonth: "desc" }, take: 12, select: { id: true, billingMonth: true, total: true, paid: true, status: true } }),
    ])
    : [null, []];
  const pr = u.property;
  return {
    id: u.id, unitNumber: u.unitNumber, floor: u.floor, bedrooms: u.bedrooms, bathrooms: u.bathrooms, diningRooms: u.diningRooms, kitchens: u.kitchens, areaSqft: u.areaSqft, furnishing: u.furnishing,
    rent: u.rent.toString(), deposit: u.deposit.toString(), utilityCharge: u.utilityCharge.toString(), availability: u.availability, description: u.description,
    property: { id: pr.id, name: pr.name, location: pr.locationText || [pr.address?.upazila, pr.address?.district].filter(Boolean).join(", ") }, owner: pr.owner,
    lease: lease ? { rent: lease.rent.toString(), deposit: lease.deposit.toString(), startDate: lease.startDate, endDate: lease.endDate, members: lease.members, noticeGiven: !!lease.noticeGivenAt } : null,
    tenant, ledger: ledger.map((r) => ({ id: r.id, month: r.billingMonth, total: r.total.toString(), paid: r.paid.toString(), status: r.status })),
    previousTenancies: previous, tickets: { open: openTickets, total: allTickets },
  };
}
