import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { getEntitlement } from "@/lib/authz/entitlement";
import { notify } from "@/lib/notify";
import { pageResult, uuid } from "@/lib/api/common";
import { computeFacilityDistances } from "@/modules/geo/facilities.service";
import { locationLabel } from "@/modules/marketplace/search.service";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { LISTED_STATUSES, listingState, MODERATION_STATES, nearbyOf, OCCUPIED, STATE_FIELDS, stateWhere, type ModerationState } from "./state";

const typeOf = (mode: "rent" | "sale") => (mode === "rent" ? "RENT" : "SALE") as "RENT" | "SALE";
const modeQuery = z.enum(["rent", "sale"]).default("rent");

/** Everything this page lists in one mode. */
const base = (mode: "rent" | "sale"): Prisma.ListingWhereInput => ({ type: typeOf(mode), status: { in: [...LISTED_STATUSES] } });

export const homeStatsQuery = z.object({ mode: modeQuery });

/** The four numbers on top of the page, for the chosen mode. */
export async function homeStats(actor: Actor, q: z.infer<typeof homeStatsQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const b = base(q.mode);
  const [total, active, pending, reported, rejected, featured, sold] = await Promise.all([
    db.listing.count({ where: b }),
    db.listing.count({ where: { AND: [b, stateWhere("ACTIVE")] } }),
    db.listing.count({ where: { AND: [b, stateWhere("PENDING")] } }),
    db.listing.count({ where: { AND: [b, stateWhere("REPORTED")] } }),
    db.listing.count({ where: { AND: [b, stateWhere("REJECTED")] } }),
    db.listing.count({ where: { AND: [b, { status: "PUBLISHED", isFeatured: true }] } }),
    db.listing.count({ where: { AND: [b, { status: "SOLD" }] } }),
  ]);
  return { mode: q.mode, total, active, pending, reported, rejected, featured, sold };
}

export const homeTableQuery = z.object({
  mode: modeQuery,
  status: z.enum(["all", "active", "pending", "reported", "rejected"]).default("all"),
  /** rent mode only */
  occupancy: z.enum(["all", "occupied", "vacant"]).default("all"),
  /** sale mode only */
  sale: z.enum(["all", "for_sale", "sold"]).default("all"),
  /** search box: title, place, owner name / code / e-mail / phone */
  q: z.string().trim().max(80).optional(),
  category: z.enum(["all", "FLAT", "APARTMENT", "BUILDING", "LAND", "COMMERCIAL", "DUPLEX", "STUDIO"]).default("all"),
  featured: z.enum(["all", "yes"]).default("all"),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

/** Rows of the table; newest first. The filters combine (status AND occupancy / sale status). */
export async function homeTable(actor: Actor, q: z.infer<typeof homeTableQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const and: Prisma.ListingWhereInput[] = [base(q.mode)];
  if (q.status !== "all") and.push(stateWhere(q.status.toUpperCase() as ModerationState));
  if (q.mode === "rent" && q.occupancy !== "all") and.push(q.occupancy === "occupied" ? OCCUPIED : { NOT: OCCUPIED });
  if (q.mode === "sale" && q.sale !== "all") and.push(q.sale === "sold" ? { status: "SOLD" } : { status: { not: "SOLD" } });
  if (q.category !== "all") and.push({ category: q.category });
  if (q.featured === "yes") and.push({ isFeatured: true, status: "PUBLISHED" });
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    and.push({ OR: [{ title: has(q.q) }, { fullAddress: has(q.q) }, { district: has(q.q) }, { upazila: has(q.q) }, { unionName: has(q.q) }, { postalCode: has(q.q) }, { seller: { fullName: has(q.q) } }, { seller: { email: has(q.q) } }, { seller: { phone: { contains: q.q } } }, { seller: { ownerCode: has(q.q) } }] });
  }
  const where: Prisma.ListingWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.listing.findMany({
      where,
      // newest posting first; the id breaks ties so the "View More" pages never repeat or skip a row
      take: q.limit + 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true, title: true, type: true, category: true, status: true, price: true, area: true, areaUnit: true, createdAt: true, fullAddress: true,
        isFeatured: true, bedrooms: true, bathrooms: true, negotiable: true,
        unionName: true, upazila: true, district: true, postalCode: true, zone: { select: { nameEn: true, nameBn: true } },
        seller: { select: { id: true, fullName: true, phone: true, email: true, ownerCode: true } },
        unit: { select: { availability: true } },
        _count: { select: { reports: { where: { status: "OPEN" } } } },
        images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } },
      },
    }),
    db.listing.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const urls = await signStorageKeys(page.items.flatMap((l) => l.images.map((i) => i.storageKey)), 3600); // the first photo is the small picture beside the title
  const items = page.items.map((l) => ({
    id: l.id, title: l.title, category: l.category, createdAt: l.createdAt, owner: l.seller,
    location: locationLabel(l) || l.fullAddress || l.zone?.nameEn || "",
    price: l.price.toString(), area: l.area?.toString() ?? null, areaUnit: l.areaUnit,
    status: l.status, state: listingState({ status: l.status, openReports: l._count.reports }), openReports: l._count.reports,
    occupied: l.status === "RENTED" || l.unit?.availability === "OCCUPIED",
    sold: l.status === "SOLD", isFeatured: l.isFeatured, bedrooms: l.bedrooms, bathrooms: l.bathrooms, negotiable: l.negotiable,
    thumbnailUrl: l.images[0] ? urls.get(l.images[0].storageKey) ?? null : null,
  }));
  return { items, nextCursor: page.nextCursor, total };
}

/** Everything "View Details" shows: photos, specs, owner, the tenant of the unit (if occupied), nearby places, open reports. */
export async function homeOverview(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({
    where: { id, status: { in: [...LISTED_STATUSES] } },
    include: {
      seller: { select: { id: true, fullName: true, phone: true, email: true, ownerCode: true, avatarKey: true } },
      zone: { select: { nameEn: true, nameBn: true } },
      images: { orderBy: { order: "asc" }, take: 8, select: { id: true, storageKey: true } },
      reports: { where: { status: "OPEN" }, orderBy: { id: "desc" }, take: 5, select: { id: true, category: true, description: true, createdAt: true } },
      unit: { select: { id: true, unitNumber: true, availability: true } },
    },
  });
  if (!l) throw new AppError("NOT_FOUND");

  let tenancy: null | { tenant: { id: string; fullName: string; tenantCode: string | null; avatarUrl: string | null }; checkIn: Date; rentStatus: string | null } = null;
  if (l.unitId) {
    const a = await db.rentalAgreement.findFirst({ where: { unitId: l.unitId, status: "ACTIVE" }, orderBy: { id: "desc" }, select: { id: true, tenantId: true, startDate: true } });
    if (a) {
      const [tenant, rec] = await Promise.all([
        db.user.findUnique({ where: { id: a.tenantId }, select: { id: true, fullName: true, tenantCode: true, avatarKey: true } }),
        db.rentRecord.findFirst({ where: { agreementId: a.id }, orderBy: { billingMonth: "desc" }, select: { status: true } }),
      ]);
      if (tenant) tenancy = { tenant: { id: tenant.id, fullName: tenant.fullName, tenantCode: tenant.tenantCode, avatarUrl: tenant.avatarKey ? await signStorageKey(tenant.avatarKey, 3600).then((r) => r.url).catch(() => null) : null }, checkIn: a.startDate, rentStatus: rec?.status ?? null };
    }
  }
  const urls = await signStorageKeys([...l.images.map((i) => i.storageKey), ...(l.seller.avatarKey ? [l.seller.avatarKey] : [])], 3600);
  return {
    id: l.id, title: l.title, type: l.type, category: l.category, description: l.description, status: l.status,
    state: listingState({ status: l.status, openReports: l.reports.length }), createdAt: l.createdAt, isFeatured: l.isFeatured,
    price: l.price.toString(), negotiable: l.negotiable, furnishing: l.furnishing, availableFrom: l.availableFrom, rejectionReason: l.rejectionReason,
    location: locationLabel(l) || l.fullAddress || l.zone?.nameEn || "",
    specs: { area: l.area?.toString() ?? null, areaUnit: l.areaUnit, bedrooms: l.bedrooms, bathrooms: l.bathrooms, balconies: l.balconies, floor: l.floor, totalFloors: l.totalFloors },
    photos: l.images.map((i) => ({ id: i.id, url: urls.get(i.storageKey) ?? null })).filter((p): p is { id: string; url: string } => !!p.url),
    owner: { id: l.seller.id, fullName: l.seller.fullName, phone: l.seller.phone, email: l.seller.email, ownerCode: l.seller.ownerCode, avatarUrl: l.seller.avatarKey ? urls.get(l.seller.avatarKey) ?? null : null },
    tenancy, occupied: l.status === "RENTED" || l.unit?.availability === "OCCUPIED", unitNumber: l.unit?.unitNumber ?? null,
    nearby: nearbyOf(l.amenities), reports: l.reports,
  };
}

export const homeStateSchema = z.object({
  state: z.enum(MODERATION_STATES as unknown as [ModerationState, ...ModerationState[]]),
  /** buy / sell listings only: true = mark as Sold, false = put a sold listing back For Sale */
  sold: z.boolean().optional(),
});
const ACTION = { ACTIVE: "approved", PENDING: "pending", REPORTED: "reported", REJECTED: "rejected" } as const;

/**
 * Edit Moderation Status: Active, Pending, Reported or Rejected, and for a buy / sell listing also For Sale or Sold.
 * The seller is told; open reports are closed when the listing is set Active. Sold needs an approved (live) listing.
 * A sold listing must first be put back For Sale (`sold: false`) before its moderation status can change.
 */
export async function setHomeState(actor: Actor, id: string, input: z.infer<typeof homeStateSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({ where: { id, status: { in: [...LISTED_STATUSES] } }, include: { _count: { select: { reports: { where: { status: "OPEN" } } } } } });
  if (!l) throw new AppError("NOT_FOUND");
  if (input.sold !== undefined && l.type !== "SALE") throw new AppError("VALIDATION_ERROR", [{ path: "sold", code: "sale_only" }]);
  if (input.sold === true && input.state !== "ACTIVE") throw new AppError("VALIDATION_ERROR", [{ path: "sold", code: "sold_needs_active" }]);
  if (l.status === "RENTED" || (l.status === "SOLD" && input.sold === undefined && input.state !== "ACTIVE")) throw new AppError("INVALID_STATE", { reason: "sold_or_rented", from: l.status });
  if (input.sold === true && l.status !== "PUBLISHED" && l.status !== "SOLD") throw new AppError("INVALID_STATE", { reason: "not_live", from: l.status });

  const markSold = input.sold === true;
  const keepSold = l.status === "SOLD" && input.sold !== false; // saving a sold listing as it already is: nothing to change
  const f = markSold || keepSold ? { status: "SOLD" as const, reason: null } : STATE_FIELDS[input.state];
  return db.$transaction(async (tx) => {
    const data: Prisma.ListingUpdateInput = { status: f.status, rejectionReason: f.reason, ...(f.status !== "PUBLISHED" ? { isFeatured: false, boostEndsAt: null } : {}) }; // only a live listing can be featured
    const activating = input.state === "ACTIVE" && !markSold && !keepSold;
    if (activating) {
      const ent = await getEntitlement(l.sellerId, "SELLER", tx);
      const own = ent.status === "NONE" ? await getEntitlement(l.sellerId, "OWNER", tx) : ent;
      if (l.status !== "PUBLISHED" || !l.expiresAt || l.expiresAt.getTime() < Date.now()) data.expiresAt = new Date(Date.now() + (own.limits.listingDurationDays || 30) * 86400_000);
      await tx.listingReport.updateMany({ where: { listingId: id, status: "OPEN" }, data: { status: "REVIEWED" } });
    }
    const out = await tx.listing.update({ where: { id }, data });
    if (activating && l.status !== "PUBLISHED") await computeFacilityDistances(id, tx);
    if (out.status !== l.status || input.state !== "ACTIVE" || markSold) {
      await notify([l.sellerId], { type: "listing.moderated", titleKey: markSold ? "notifications.listing_sold" : `notifications.listing_${ACTION[input.state]}`, params: { title: l.title }, link: "/home-owner/marketplace" }, tx);
    }
    await writeAudit({ actor, action: markSold ? "listing.mark_sold" : `listing.set_${input.state.toLowerCase()}`, resourceType: "Listing", resourceId: id, before: { status: l.status, openReports: l._count.reports }, after: { status: out.status }, req }, tx);
    const openReports = activating ? 0 : l._count.reports;
    return { id, status: out.status, state: listingState({ status: out.status, openReports }), sold: out.status === "SOLD" };
  });
}

/** Delete & Archive: the listing leaves the page and the public site and moves to Previous Properties. Nothing is erased. */
export async function archiveHomeListing(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({ where: { id, status: { in: [...LISTED_STATUSES] } }, select: { id: true, title: true, sellerId: true, status: true } });
  if (!l) throw new AppError("NOT_FOUND");
  const reason = "Removed by Super Admin";
  await db.$transaction(async (tx) => {
    await tx.listing.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), archiveReason: reason, isFeatured: false, boostEndsAt: null } });
    await notify([l.sellerId], { type: "listing.moderated", titleKey: "notifications.listing_removed", params: { title: l.title }, link: "/home-owner/marketplace" }, tx);
    await writeAudit({ actor, action: "listing.archive", resourceType: "Listing", resourceId: id, before: { status: l.status }, after: { reason, by: "super_admin" }, req }, tx);
  });
  return { id, archived: true };
}

export const homeFeatureSchema = z.object({ featured: z.boolean() });

/** Feature / Unfeature: featured listings rank first in the public Marketplace. Only a live (PUBLISHED, not reported) listing can be featured. */
export async function setHomeFeatured(actor: Actor, id: string, input: z.infer<typeof homeFeatureSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const l = await db.listing.findFirst({ where: { id, status: { in: [...LISTED_STATUSES] } }, include: { _count: { select: { reports: { where: { status: "OPEN" } } } } } });
  if (!l) throw new AppError("NOT_FOUND");
  if (input.featured && (l.status !== "PUBLISHED" || l._count.reports > 0)) throw new AppError("INVALID_STATE", { reason: "not_live", from: l.status });
  if (l.isFeatured === input.featured) return { id, isFeatured: l.isFeatured };
  await db.$transaction(async (tx) => {
    await tx.listing.update({ where: { id }, data: { isFeatured: input.featured, ...(input.featured ? {} : { boostEndsAt: null }) } });
    await writeAudit({ actor, action: input.featured ? "listing.feature" : "listing.unfeature", resourceType: "Listing", resourceId: id, before: { isFeatured: l.isFeatured }, after: { isFeatured: input.featured }, req }, tx);
  });
  return { id, isFeatured: input.featured };
}
