import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { setPoint } from "@/lib/geo-point";
import { notify } from "@/lib/notify";
import { pageArgs, pageResult, uuid } from "@/lib/api/common";
import { propertyCreateSchema } from "@/modules/properties/schema";
import { keyBelongsTo, keyPurpose, signStorageKey } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { revertToTenantFree } from "@/modules/tenancy/roles";
import { allAmenities, amenitiesSchema } from "./amenities";
import { occupancyRate, propertyState, STATE_FIELDS } from "./status";

const joinPlace = (a: { area: string | null; upazila: string | null; district: string; division: string } | null) =>
  a ? [a.area, a.upazila, a.district, a.division].filter(Boolean).join(", ") : "";

const live = { archivedAt: null } as const;
/** which rows each tab shows (see status.ts) */
const TAB_WHERE = {
  all: {},
  active: { status: "ACTIVE", verificationStatus: "VERIFIED" },
  pending: { status: "ACTIVE", verificationStatus: { in: ["UNVERIFIED", "PENDING"] } },
} satisfies Record<string, Prisma.PropertyWhereInput>;

export const adminPropertiesQuery = z.object({
  tab: z.enum(["all", "active", "pending"]).default("all"),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

/** The four numbers on top of the page. Units = the larger of the owner's declared number and the real unit rows, like the owner's list. */
export async function adminPropertyStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [props, units, pending] = await Promise.all([
    db.property.count({ where: live }),
    db.$queryRaw<{ total: bigint; occupied: bigint }[]>`
      SELECT COALESCE(sum(GREATEST(COALESCE(p."declaredUnits", 0), COALESCE(u.n, 0))), 0) AS total, COALESCE(sum(COALESCE(u.occ, 0)), 0) AS occupied
      FROM "Property" p
      LEFT JOIN (SELECT "propertyId", count(*) AS n, count(*) FILTER (WHERE availability = 'OCCUPIED') AS occ FROM "Unit" WHERE "archivedAt" IS NULL GROUP BY "propertyId") u ON u."propertyId" = p.id
      WHERE p."archivedAt" IS NULL`,
    db.property.count({ where: { ...live, ...TAB_WHERE.pending } }),
  ]);
  const totalUnits = Number(units[0]?.total ?? 0), occupiedUnits = Number(units[0]?.occupied ?? 0);
  return { totalProperties: props, totalUnits, occupiedUnits, occupancyRate: occupancyRate(occupiedUnits, totalUnits), pendingApproval: pending };
}

/** Rows of the table: property, owner, place, unit counts and state. Newest first. */
export async function listAdminProperties(actor: Actor, q: z.infer<typeof adminPropertiesQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const where: Prisma.PropertyWhereInput = { ...live, ...TAB_WHERE[q.tab] };
  const [rows, total] = await Promise.all([
    db.property.findMany({
      where, ...pageArgs(q),
      select: {
        id: true, name: true, type: true, status: true, verificationStatus: true, declaredUnits: true, locationText: true, createdAt: true,
        owner: { select: { id: true, fullName: true, phone: true, ownerCode: true } },
        address: { select: { area: true, upazila: true, district: true, division: true } },
      },
    }),
    db.property.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const stats = await db.unit.groupBy({ by: ["propertyId", "availability"], where: { propertyId: { in: page.items.map((p) => p.id) }, archivedAt: null }, _count: { _all: true } });
  const items = page.items.map(({ address, declaredUnits, locationText, ...p }) => {
    const mine = stats.filter((s) => s.propertyId === p.id);
    const rowsOfUnits = mine.reduce((n, s) => n + s._count._all, 0);
    const occupiedUnits = mine.find((s) => s.availability === "OCCUPIED")?._count._all ?? 0;
    return { ...p, location: locationText || joinPlace(address), totalUnits: Math.max(declaredUnits ?? 0, rowsOfUnits), occupiedUnits, state: propertyState(p) };
  });
  return { items, nextCursor: page.nextCursor, total };
}

/** Everything the "View Details" window shows. Photos come as 1-hour signed links (private bucket). */
export async function adminPropertyOverview(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({
    where: { id, ...live },
    include: {
      owner: { select: { id: true, fullName: true, phone: true, ownerCode: true } }, address: true,
      images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 12 },
      units: { where: { archivedAt: null }, orderBy: [{ floor: "asc" }, { unitNumber: "asc" }], take: 300, select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, rent: true, availability: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const occupied = p.units.filter((u) => u.availability === "OCCUPIED").length;
  const unitRows = await db.unit.count({ where: { propertyId: id, archivedAt: null } });
  const totalUnits = Math.max(p.declaredUnits ?? 0, unitRows);
  const sqft = p.totalSqft ?? p.units.reduce((s, u) => s + (u.areaSqft ?? 0), 0);
  const photos = (await Promise.all(p.images.map((i) => signStorageKey(i.storageKey, 3600).then((r) => ({ id: i.id, url: r.url })).catch(() => null)))).filter((x): x is { id: string; url: string } => !!x);
  return {
    id: p.id, name: p.name, type: p.type, description: p.description, state: propertyState(p), verificationStatus: p.verificationStatus, status: p.status,
    location: p.locationText || joinPlace(p.address), address: p.address, totalFloors: p.totalFloors, sqft: sqft || null, createdAt: p.createdAt,
    owner: p.owner, photos, amenities: allAmenities(p.amenities, p.securityFeatures),
    occupancy: { totalUnits, occupiedUnits: occupied, vacantUnits: Math.max(0, totalUnits - occupied), rate: occupancyRate(occupied, totalUnits) },
    units: p.units.map((u) => ({ ...u, rent: u.rent.toString() })),
  };
}

export const setStateSchema = z.object({ status: z.enum(["ACTIVE", "PENDING"]) });

/** Active = approved and running; Pending = back to waiting for approval. The owner is told. */
export async function setPropertyState(actor: Actor, id: string, input: z.infer<typeof setStateSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const before = await db.property.findFirst({ where: { id, ...live } });
  if (!before) throw new AppError("NOT_FOUND");
  const fields = STATE_FIELDS[input.status];
  return db.$transaction(async (tx) => {
    const p = await tx.property.update({ where: { id }, data: { ...fields, reviewedAt: new Date() } });
    if (input.status === "ACTIVE") await tx.verificationDocument.updateMany({ where: { ownerType: "PROPERTY", ownerId: id, status: "PENDING" }, data: { status: "VERIFIED", reviewerId: actor.id } });
    await notify([before.ownerId], { type: "property.review", titleKey: input.status === "ACTIVE" ? "notifications.propertyApproved" : "notifications.propertyPending", params: { name: before.name }, link: `/home-owner/properties/${id}` }, tx);
    await writeAudit({ actor, action: input.status === "ACTIVE" ? "property.verify" : "property.set_pending", resourceType: "Property", resourceId: id, before: { status: before.status, verification: before.verificationStatus }, after: fields, req }, tx);
    return { id: p.id, state: propertyState(p) };
  });
}

/**
 * Delete from the Super Admin page: a soft delete (the row moves to Previous Properties, nothing is erased).
 * Tenants who still live there are moved out first: their lease ends, they are told, and a tenant with no other
 * home goes back to a Tenant-Free account.
 */
export async function deleteProperty(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({ where: { id, ...live } });
  if (!p) throw new AppError("NOT_FOUND");
  const reason = "Removed by Super Admin";
  const movedOut = await db.$transaction(async (tx) => {
    const leases = await tx.rentalAgreement.findMany({ where: { unit: { propertyId: id }, status: { in: ["ACTIVE", "INVITED"] } }, select: { id: true, tenantId: true, status: true, unit: { select: { unitNumber: true } } } });
    const today = new Date();
    for (const l of leases) {
      await tx.rentalAgreement.update({ where: { id: l.id }, data: { status: l.status === "ACTIVE" ? "ENDED" : "TERMINATED", endDate: today } });
      if (l.status === "ACTIVE") {
        await notify([l.tenantId], { type: "tenancy.ended", titleKey: "notifications.tenancyEnded", params: { unit: l.unit.unitNumber } }, tx);
        await revertToTenantFree(tx, l.tenantId, actor, req);
      }
    }
    await tx.unit.updateMany({ where: { propertyId: id, archivedAt: null }, data: { archivedAt: today, availability: "ARCHIVED" } });
    await tx.property.update({ where: { id }, data: { archivedAt: today, archiveReason: reason, status: "ARCHIVED" } });
    await notify([p.ownerId], { type: "property.review", titleKey: "notifications.propertyRemoved", params: { name: p.name }, link: "/home-owner/properties" }, tx);
    await writeAudit({ actor, action: "property.archive", resourceType: "Property", resourceId: id, after: { reason, by: "super_admin", tenantsMovedOut: leases.filter((l) => l.status === "ACTIVE").length }, req }, tx);
    return leases.filter((l) => l.status === "ACTIVE").length;
  });
  return { id, deleted: true, tenantsMovedOut: movedOut };
}

export const adminCreatePropertySchema = z.intersection(propertyCreateSchema, z.object({ ownerId: uuid, amenities: amenitiesSchema }));

/** "+ Add New Property": the Super Admin adds a building for an owner. Plan limits do not bind the Super Admin; the property starts as Active. */
export async function adminCreateProperty(actor: Actor, input: z.infer<typeof adminCreatePropertySchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const { ownerId, address, lat, lng, totalFloors, ...rest } = input; // rest includes amenities
  const owner = await db.user.findFirst({ where: { id: ownerId, role: "OWNER", status: "ACTIVE", archivedAt: null }, select: { id: true } });
  if (!owner) throw new AppError("VALIDATION_ERROR", [{ path: "ownerId", code: "not_an_owner" }]);
  const floors = totalFloors ?? Math.min(100, Math.max(1, Math.ceil((rest.declaredUnits ?? 4) / 4)));
  return db.$transaction(async (tx) => {
    const addr = address ? await tx.address.create({ data: address }) : null;
    const p = await tx.property.create({ data: { ...rest, totalFloors: floors, ownerId, addressId: addr?.id, status: "ACTIVE", verificationStatus: "VERIFIED", reviewedAt: new Date() } });
    if (lat !== undefined && lng !== undefined) await setPoint(tx, "Property", p.id, lat, lng);
    await notify([ownerId], { type: "property.review", titleKey: "notifications.propertyAdded", params: { name: p.name }, link: `/home-owner/properties/${p.id}` }, tx);
    await writeAudit({ actor, action: "property.create", resourceType: "Property", resourceId: p.id, after: { ownerId, by: "super_admin" }, req }, tx);
    return { id: p.id, name: p.name, state: propertyState(p) };
  });
}

/** Owners to pick from in the "Add New Property" window. */
export async function ownerChoices(actor: Actor, q: string | undefined) {
  requireRole(actor, "SUPER_ADMIN");
  const rows = await db.user.findMany({
    where: { role: "OWNER", status: "ACTIVE", archivedAt: null, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { ownerCode: { contains: q.toUpperCase() } }] } : {}) },
    orderBy: { fullName: "asc" }, take: 20, select: { id: true, fullName: true, phone: true, ownerCode: true },
  });
  return { items: rows };
}

export const adminImageSchema = z.object({ storageKey: z.string().trim().min(3).max(300) });

/** "Upload image" in Add New Property: the Super Admin's own PROPERTY_IMAGE upload becomes the next photo of the building (at most 20). */
export async function adminAddImage(actor: Actor, id: string, input: z.infer<typeof adminImageSchema>) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({ where: { id, ...live }, select: { id: true } });
  if (!p) throw new AppError("NOT_FOUND");
  if (keyPurpose(input.storageKey) !== "PROPERTY_IMAGE" || !keyBelongsTo(input.storageKey, actor.id)) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  const count = await db.propertyImage.count({ where: { propertyId: id } });
  if (count >= 20) throw new AppError("PLAN_LIMIT_REACHED", { kind: "image", cap: 20 });
  const img = await db.propertyImage.create({ data: { propertyId: id, storageKey: input.storageKey, order: count } });
  return { id: img.id };
}
