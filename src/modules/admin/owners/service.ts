import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { adminRangeQuery, dhakaToday, resolveRange } from "@/modules/dashboards/admin-range";
import { deleteProperty } from "@/modules/admin/properties/service";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { OWNER_EXIT_REASONS } from "@/modules/admin/previous-owners/reasons";
import { DOC_KINDS, documentViews, reviewUserDocument, type DocKindName, type documentReviewSchema } from "@/modules/admin/shared/document-review";

/** Super Admin → Active Owners: landlords with their portfolio, plan and account status (Active / Warning / Suspended). */

export const PAGE_SIZE = 10;
const LIVE_STATUSES = ["ACTIVE", "SUSPENDED"] as const; // an owner shown on this page: not archived, can be warned or suspended
const PLAN_OK = ["ACTIVE", "GRACE"] as const;

/** The page opens on the last 30 days, like the Report page. */
const range = (q: z.infer<typeof adminRangeQuery>) => {
  const to = q.to ?? dhakaToday();
  return resolveRange({ from: q.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10), to });
};

export type AccountState = "ACTIVE" | "WARNING" | "SUSPENDED";
/** What the badge says: Suspended wins, then a standing warning, else Active. */
export const accountState = (u: { status: string; warnedAt: Date | null }): AccountState => (u.status === "SUSPENDED" ? "SUSPENDED" : u.warnedAt ? "WARNING" : "ACTIVE");

const baseOwner = (): Prisma.UserWhereInput => ({ role: "OWNER", archivedAt: null, status: { in: [...LIVE_STATUSES] } });
const marketListing: Prisma.ListingWhereInput = { type: "SALE", status: { in: ["PUBLISHED", "SOLD"] } };

export const ownersModeQuery = z.object({ mode: z.enum(["rental", "market"]).default("rental") });

/** The three cards: owners, what they manage, and what is new in the chosen dates. */
export async function ownersStats(actor: Actor, q: z.infer<typeof adminRangeQuery> & z.infer<typeof ownersModeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const r = range(q);
  const owners = { ...baseOwner(), createdAt: { lte: r.end } };
  if (q.mode === "market") {
    const sellers: Prisma.UserWhereInput = { ...owners, listings: { some: marketListing } };
    const [totalOwners, total, fresh] = await Promise.all([
      db.user.count({ where: sellers }),
      db.listing.count({ where: { ...marketListing, createdAt: { lte: r.end }, seller: sellers } }),
      db.listing.count({ where: { ...marketListing, createdAt: { gte: r.start, lte: r.end }, seller: sellers } }),
    ]);
    return { mode: q.mode, range: { from: r.from, to: r.to }, totalOwners, total, average: totalOwners ? Math.round((total / totalOwners) * 10) / 10 : 0, fresh };
  }
  const [totalOwners, total, fresh] = await Promise.all([
    db.user.count({ where: owners }),
    db.property.count({ where: { archivedAt: null, createdAt: { lte: r.end }, owner: owners } }),
    db.property.count({ where: { archivedAt: null, createdAt: { gte: r.start, lte: r.end }, owner: owners } }),
  ]);
  return { mode: q.mode, range: { from: r.from, to: r.to }, totalOwners, total, average: totalOwners ? Math.round((total / totalOwners) * 10) / 10 : 0, fresh };
}

export const ownersListQuery = z.object({
  mode: z.enum(["rental", "market"]).default("rental"),
  tier: z.enum(["all", "PRIMARY", "MILLIONAIRE", "BILLIONAIRE"]).default("all"),
  /** account status: Active (no warning), Warning (can still sign in), Suspended */
  status: z.enum(["all", "ACTIVE", "WARNING", "SUSPENDED"]).default("all"),
  /** NID verification: Verified, Pending (documents waiting), Rejected, Not Verified (nothing sent) */
  verification: z.enum(["all", "VERIFIED", "PENDING", "REJECTED", "UNVERIFIED"]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

const planSelect = { where: { audience: "OWNER" as const, status: { in: [...PLAN_OK] } }, orderBy: { createdAt: "desc" as const }, take: 1, select: { status: true, endsAt: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } };

export async function ownersList(actor: Actor, q: z.infer<typeof ownersListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const and: Prisma.UserWhereInput[] = [baseOwner()];
  if (q.mode === "market") and.push({ listings: { some: marketListing } });
  if (q.verification !== "all") and.push({ verificationStatus: q.verification });
  if (q.status === "ACTIVE") and.push({ status: "ACTIVE", warnedAt: null });
  if (q.status === "WARNING") and.push({ status: "ACTIVE", warnedAt: { not: null } });
  if (q.status === "SUSPENDED") and.push({ status: "SUSPENDED" });
  if (q.tier !== "all") and.push({ subscriptions: { some: { audience: "OWNER", status: { in: [...PLAN_OK] }, plan: { code: q.tier } } } });
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    and.push({ OR: [{ fullName: has(q.q) }, { username: has(q.q) }, { email: has(q.q) }, { phone: { contains: q.q } }, { ownerCode: has(q.q) }] });
  }
  const where: Prisma.UserWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, orderBy: { id: "desc" }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, fullName: true, username: true, ownerCode: true, email: true, phone: true, status: true, warnedAt: true, createdAt: true, avatarKey: true, verificationStatus: true, subscriptions: planSelect },
    }),
    db.user.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [props, avatars] = await Promise.all([
    db.property.findMany({ where: { ownerId: { in: ids }, archivedAt: null }, select: { id: true, ownerId: true } }),
    signStorageKeys(rows.flatMap((r) => (r.avatarKey ? [r.avatarKey] : [])), 3600),
  ]);
  const unitRows = props.length ? await db.unit.groupBy({ by: ["propertyId"], where: { propertyId: { in: props.map((p) => p.id) }, archivedAt: null }, _count: { _all: true } }) : [];
  const unitsOf = new Map(unitRows.map((u) => [u.propertyId, u._count._all]));
  const portfolio = new Map<string, { properties: number; units: number }>();
  for (const p of props) { const c = portfolio.get(p.ownerId) ?? { properties: 0, units: 0 }; c.properties++; c.units += unitsOf.get(p.id) ?? 0; portfolio.set(p.ownerId, c); }

  const market = new Map<string, { total: number; forSale: number; sold: number; soldValue: number }>();
  if (q.mode === "market" && ids.length) {
    const g = await db.listing.groupBy({ by: ["sellerId", "status"], where: { sellerId: { in: ids }, ...marketListing }, _count: { _all: true }, _sum: { price: true } });
    for (const x of g) {
      const c = market.get(x.sellerId) ?? { total: 0, forSale: 0, sold: 0, soldValue: 0 };
      c.total += x._count._all;
      if (x.status === "PUBLISHED") c.forSale += x._count._all;
      if (x.status === "SOLD") { c.sold += x._count._all; c.soldValue += Number(x._sum.price ?? 0); }
      market.set(x.sellerId, c);
    }
  }
  const items = rows.map(({ subscriptions, status, warnedAt, avatarKey, verificationStatus, ...u }) => ({
    ...u, verification: verificationStatus, state: accountState({ status, warnedAt }), avatarUrl: avatarKey ? avatars.get(avatarKey) ?? null : null,
    plan: subscriptions[0]?.plan ?? null,
    portfolio: portfolio.get(u.id) ?? { properties: 0, units: 0 },
    ...(q.mode === "market" ? { market: market.get(u.id) ?? { total: 0, forSale: 0, sold: 0, soldValue: 0 } } : {}),
  }));
  return { items, total, page: q.page, pageSize: PAGE_SIZE, mode: q.mode };
}

const listingRecord = (l: { id: string; title: string; category: string; price: Prisma.Decimal; status: string; isFeatured: boolean; createdAt: Date; district: string | null; upazila: string | null; bedrooms: number | null }) => ({
  id: l.id, title: l.title, category: l.category, price: l.price.toString(), status: l.status, isFeatured: l.isFeatured, createdAt: l.createdAt, bedrooms: l.bedrooms,
  location: [l.upazila, l.district].filter(Boolean).join(", "),
});

/** Full owner profile for the View window: profile, plan, every property with its units, the marketplace summary and the comment log. */
export async function ownerDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({
    where: { id, role: "OWNER", archivedAt: null },
    select: {
      id: true, fullName: true, username: true, ownerCode: true, email: true, phone: true, status: true, warnedAt: true, createdAt: true, lastSeenAt: true, avatarKey: true,
      verificationStatus: true, gender: true, occupation: true, locale: true, nid: true, nidLast4: true, dateOfBirth: true,
      address: { select: { division: true, district: true, upazila: true, union: true, area: true, street: true, postOffice: true } },
      subscriptions: { where: { audience: "OWNER", status: { in: [...PLAN_OK] } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, cycle: true, startsAt: true, endsAt: true, amount: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND");
  const [props, logs, paid, listings, saleRows, docs, leaseCopy] = await Promise.all([
    db.property.findMany({
      where: { ownerId: id, archivedAt: null }, orderBy: { id: "desc" }, take: 100,
      select: { id: true, name: true, type: true, status: true, totalFloors: true, locationText: true, address: { select: { upazila: true, district: true } } },
    }),
    db.accountStatusLog.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 200, select: { id: true, action: true, comment: true, adminUsername: true, createdAt: true } }),
    db.paymentTransaction.aggregate({ where: { userId: id, status: "SUCCESS" }, _sum: { amount: true }, _count: { _all: true } }),
    db.listing.groupBy({ by: ["status"], where: { sellerId: id, type: "SALE" }, _count: { _all: true }, _sum: { price: true } }),
    db.listing.findMany({
      where: { sellerId: id, type: "SALE", status: { in: ["PUBLISHED", "SOLD"] } }, orderBy: { id: "desc" }, take: 100,
      select: { id: true, title: true, category: true, price: true, status: true, isFeatured: true, createdAt: true, district: true, upazila: true, bedrooms: true },
    }),
    db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: id, kind: { in: [...DOC_KINDS] } }, orderBy: { id: "desc" }, select: { id: true, kind: true, status: true, notes: true, storageKey: true, createdAt: true } }),
    // the newest tenancy agreement file the owner saved (view only)
    db.rentalAgreement.findFirst({ where: { ownerId: id, agreementDocKey: { not: null } }, orderBy: { updatedAt: "desc" }, select: { agreementDocKey: true, updatedAt: true } }),
  ]);
  const documents = await documentViews(docs, leaseCopy);
  const unitStats = props.length ? await db.unit.groupBy({ by: ["propertyId", "availability"], where: { propertyId: { in: props.map((p) => p.id) }, archivedAt: null }, _count: { _all: true } }) : [];
  const portfolio = props.map((p) => {
    const mine = unitStats.filter((x) => x.propertyId === p.id);
    const units = mine.reduce((a, x) => a + x._count._all, 0), occupied = mine.filter((x) => x.availability === "OCCUPIED").reduce((a, x) => a + x._count._all, 0);
    const { address, locationText, ...rest } = p;
    return { ...rest, location: [...new Set([locationText, address?.upazila, address?.district].filter(Boolean) as string[])].join(", "), units, occupied, vacant: Math.max(0, units - occupied) };
  });
  const avatarUrl = u.avatarKey ? await signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : null;
  const a = u.address;
  const sale = (...st: string[]) => listings.filter((x) => st.includes(x.status));
  const { subscriptions, avatarKey, warnedAt, status, address: _addr, ...rest } = u;
  return {
    ...rest, state: accountState({ status, warnedAt }), avatarUrl,
    address: a ? [a.street, a.area, a.union, a.postOffice, a.upazila, a.district, a.division].filter(Boolean).join(", ") : null,
    documents,
    subscription: subscriptions[0] ? { ...subscriptions[0], amount: subscriptions[0].amount.toString() } : null,
    payments: { count: paid._count._all, total: (paid._sum.amount ?? 0).toString() },
    totals: { properties: portfolio.length, units: portfolio.reduce((x, p) => x + p.units, 0), occupied: portfolio.reduce((x, p) => x + p.occupied, 0), vacant: portfolio.reduce((x, p) => x + p.vacant, 0) },
    market: { forSale: sale("PUBLISHED").reduce((x, l) => x + l._count._all, 0), sold: sale("SOLD").reduce((x, l) => x + l._count._all, 0), soldValue: sale("SOLD").reduce((x, l) => x + Number(l._sum.price ?? 0), 0).toString() },
    properties: portfolio, log: logs,
    forSaleList: saleRows.filter((l) => l.status === "PUBLISHED").map(listingRecord),
    soldList: saleRows.filter((l) => l.status === "SOLD").map(listingRecord),
  };
}

/** Edit window: Active, Warning or Suspended. Warning and Suspended need a written reason; it goes to the owner and into the permanent log. */
export const ownerStatusSchema = z.object({
  status: z.enum(["ACTIVE", "WARNING", "SUSPENDED"]),
  comment: z.string().trim().min(3).max(500).optional(),
}).strict().superRefine((v, ctx) => { if (v.status !== "ACTIVE" && !v.comment) ctx.addIssue({ code: "custom", path: ["comment"], message: "comment_required" }); });

export async function setOwnerStatus(actor: Actor, id: string, input: z.infer<typeof ownerStatusSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const u = await tx.user.findFirst({ where: { id, role: "OWNER", archivedAt: null }, select: { id: true, status: true, warnedAt: true } });
    if (!u) throw new AppError("NOT_FOUND");
    const before = accountState(u);
    if (before === input.status && !input.comment) return { id, state: before, changed: false as const };
    const comment = input.status === "ACTIVE" ? input.comment ?? null : input.comment!;
    await tx.user.update({ where: { id }, data: { status: input.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE", warnedAt: input.status === "WARNING" ? new Date() : null } });
    await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: input.status, comment } });
    const key = input.status === "WARNING" ? "accountWarning" : input.status === "SUSPENDED" ? "accountSuspended" : "accountRestored";
    await notify([id], { type: `account.${input.status.toLowerCase()}`, titleKey: `notifications.${key}`, params: input.status === "ACTIVE" ? {} : { reason: comment ?? "" }, link: "/home-owner/dashboard", priority: input.status === "ACTIVE" ? "NORMAL" : "HIGH" }, tx);
    await writeAudit({ actor, action: `owner.${input.status.toLowerCase()}`, resourceType: "User", resourceId: id, before: { state: before }, after: { state: input.status, comment }, req }, tx);
    return { id, state: input.status, changed: true as const };
  });
}

export const ownerArchiveSchema = z.object({ reason: z.string().trim().min(3).max(300).optional(), reasonCode: z.enum(OWNER_EXIT_REASONS).optional() }).strict();

/**
 * "Delete owner": the owner moves to Previous Owners. Their properties are archived the same way the Properties page does it
 * (tenants moved out, tenants told), their marketplace listings are taken down, and they can no longer sign in.
 */
export async function archiveOwner(actor: Actor, id: string, input: z.infer<typeof ownerArchiveSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({ where: { id, role: "OWNER", archivedAt: null }, select: { id: true } });
  if (!u) throw new AppError("NOT_FOUND");
  const reason = input.reason ?? "Archived by the Super Admin";
  const props = await db.property.findMany({ where: { ownerId: id, archivedAt: null }, select: { id: true } });
  for (const p of props) await deleteProperty(actor, p.id, req);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const taken = await tx.listing.updateMany({ where: { sellerId: id, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: reason, isFeatured: false, boostEndsAt: null } });
    await tx.user.update({ where: { id }, data: { status: "INACTIVE", archivedAt: now, leftAt: now, archiveReason: reason, archiveReasonCode: input.reasonCode ?? "OTHER", warnedAt: null } });
    await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: "ARCHIVED", comment: reason } });
    await writeAudit({ actor, action: "owner.archive", resourceType: "User", resourceId: id, after: { reason, properties: props.length, listings: taken.count }, req }, tx);
    return { id, archived: true as const, properties: props.length, listings: taken.count };
  });
}

/** Short information about one property of the owner: where it is and every unit with who lives in it. */
export async function ownerPropertyShort(actor: Actor, ownerId: string, propertyId: string) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({
    where: { id: propertyId, ownerId, archivedAt: null },
    select: {
      id: true, name: true, type: true, status: true, totalFloors: true, locationText: true, createdAt: true, amenities: true,
      address: { select: { upazila: true, district: true, division: true } },
      units: { where: { archivedAt: null }, orderBy: [{ floor: "asc" }, { unitNumber: "asc" }], take: 300, select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, rent: true, availability: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const leases = await db.rentalAgreement.findMany({ where: { status: "ACTIVE", unitId: { in: p.units.map((u) => u.id) } }, select: { unitId: true, tenantId: true } });
  const people = new Map((await db.user.findMany({ where: { id: { in: leases.map((l) => l.tenantId) } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const tenantOf = new Map(leases.map((l) => [l.unitId, people.get(l.tenantId) ?? null]));
  const occupied = p.units.filter((u) => u.availability === "OCCUPIED").length;
  const a = p.address;
  return {
    id: p.id, name: p.name, type: p.type, status: p.status, totalFloors: p.totalFloors, createdAt: p.createdAt, amenities: p.amenities.slice(0, 12),
    location: [...new Set([p.locationText, a?.upazila, a?.district, a?.division].filter(Boolean) as string[])].join(", "),
    totals: { units: p.units.length, occupied, vacant: Math.max(0, p.units.length - occupied) },
    units: p.units.map((u) => ({ id: u.id, unitNumber: u.unitNumber, floor: u.floor, bedrooms: u.bedrooms, bathrooms: u.bathrooms, areaSqft: u.areaSqft, rent: u.rent.toString(), availability: u.availability, tenant: tenantOf.get(u.id) ?? null })),
  };
}

/** Short information about one marketplace listing of the owner (for sale or sold). */
export async function ownerListingShort(actor: Actor, ownerId: string, listingId: string) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({
    where: { id: listingId, sellerId: ownerId, type: "SALE", status: { in: ["PUBLISHED", "SOLD"] } },
    select: {
      id: true, title: true, category: true, status: true, price: true, negotiable: true, description: true, isFeatured: true, createdAt: true, updatedAt: true,
      bedrooms: true, bathrooms: true, area: true, areaUnit: true, floor: true, totalFloors: true, district: true, upazila: true, fullAddress: true,
      images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } },
    },
  });
  if (!l) throw new AppError("NOT_FOUND");
  const photo = l.images[0] ? await signStorageKey(l.images[0].storageKey, 3600).then((r) => r.url).catch(() => null) : null;
  const { images, price, area, description, ...rest } = l;
  return { ...rest, price: price.toString(), area: area?.toString() ?? null, description: description.length > 400 ? `${description.slice(0, 400)}…` : description, photoUrl: photo, location: l.fullAddress || [l.upazila, l.district].filter(Boolean).join(", ") };
}

/** Verify or reject one document of the owner (NID front, NID back or agreement). */
export async function reviewOwnerDocument(actor: Actor, id: string, kind: DocKindName, input: z.infer<typeof documentReviewSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({ where: { id, role: "OWNER", archivedAt: null }, select: { id: true } });
  if (!u) throw new AppError("NOT_FOUND");
  return { id, ...(await reviewUserDocument(actor, id, kind, input, req, "/home-owner/profile")) };
}
