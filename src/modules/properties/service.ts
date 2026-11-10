import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { setPoint } from "@/lib/geo-point";
import { assertEntitlement } from "@/lib/authz/entitlement";
import { authorize } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { supabaseAdmin } from "@/lib/supabase";
import { BUCKET, keyBelongsTo, keyPurpose, signStorageKey } from "@/modules/uploads/service";
import { loadProperty } from "./access";
import type { imageSchema, propertyCreateSchema, propertyListQuery, propertyUpdateSchema } from "./schema";

const joinPlace = (a: { area: string | null; upazila: string | null; district: string; division: string } | null) =>
  a ? [a.area, a.upazila, a.district, a.division].filter(Boolean).join(", ") : "";

/**
 * Properties list rows: the property plus ready-to-show figures.
 *  - totalUnits = the larger of the owner's declared number and the real unit rows; vacant = total − occupied
 *  - sqft = the owner's figure, else the sum of unit areas
 *  - coverUrl = 1-hour signed link to the first image (private bucket)
 */
export async function listProperties(actor: Actor, q: z.infer<typeof propertyListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "property:read", { ownerId: actor.id, readOnly: true });
  const rows = await db.property.findMany({
    where: {
      ...(actor.role === "OWNER" ? { ownerId: actor.id } : {}),
      status: q.status,
      ...(q.includeArchived ? {} : { archivedAt: null }),
    },
    include: { _count: { select: { units: true } }, address: true, images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1 } },
    ...pageArgs(page),
  });
  const { items, nextCursor } = pageResult(rows, page.limit);

  const stats = await db.unit.groupBy({
    by: ["propertyId", "availability"],
    where: { propertyId: { in: items.map((p) => p.id) }, archivedAt: null },
    _count: { _all: true },
    _sum: { areaSqft: true },
  });
  const byProp = new Map<string, { units: number; occupied: number; area: number }>();
  for (const g of stats) {
    const cur = byProp.get(g.propertyId) ?? { units: 0, occupied: 0, area: 0 };
    cur.units += g._count._all;
    if (g.availability === "OCCUPIED") cur.occupied += g._count._all;
    cur.area += g._sum.areaSqft ?? 0;
    byProp.set(g.propertyId, cur);
  }

  const out = await Promise.all(
    items.map(async (p) => {
      const st = byProp.get(p.id) ?? { units: 0, occupied: 0, area: 0 };
      const totalUnits = Math.max(p.declaredUnits ?? 0, st.units);
      const cover = p.images[0];
      return {
        ...p,
        images: undefined,
        locationLabel: p.locationText || joinPlace(p.address),
        sqft: p.totalSqft ?? st.area,
        totalUnits,
        occupiedUnits: st.occupied,
        vacantUnits: Math.max(0, totalUnits - st.occupied),
        coverImageId: cover?.id ?? null,
        coverUrl: cover ? await signStorageKey(cover.storageKey, 3600).then((r) => r.url).catch(() => null) : null,
      };
    }),
  );
  return { items: out, nextCursor };
}

export async function getProperty(actor: Actor, id: string) {
  await loadProperty(actor, id, "read");
  return db.property.findUnique({
    where: { id },
    include: { address: true, zone: true, images: { orderBy: { order: "asc" } }, _count: { select: { units: true } } },
  });
}

export async function createProperty(actor: Actor, input: z.infer<typeof propertyCreateSchema>, req: Request) {
  await authorize(actor, "property:manage", { ownerId: actor.id });
  const { address, lat, lng, totalFloors, ...rest } = input;
  // the Properties form does not ask for floors: assume about 4 units per floor until the owner edits it
  const floors = totalFloors ?? Math.min(100, Math.max(1, Math.ceil((rest.declaredUnits ?? 4) / 4)));
  return db.$transaction(async (tx) => {
    await assertEntitlement(actor, "property", { tx });
    const addr = address ? await tx.address.create({ data: address }) : null;
    const p = await tx.property.create({
      data: { ...rest, totalFloors: floors, ownerId: actor.id, addressId: addr?.id },
      include: { address: true },
    });
    if (lat !== undefined && lng !== undefined) await setPoint(tx, "Property", p.id, lat, lng);
    await writeAudit({ actor, action: "property.create", resourceType: "Property", resourceId: p.id, req }, tx);
    return p;
  });
}

export async function updateProperty(actor: Actor, id: string, data: z.infer<typeof propertyUpdateSchema>, req: Request) {
  const before = await loadProperty(actor, id, "manage");
  if (before.archivedAt) throw new AppError("INVALID_STATE", { reason: "archived" });
  if (data.totalFloors !== undefined) {
    const top = await db.unit.aggregate({ where: { propertyId: id, archivedAt: null }, _max: { floor: true } });
    if ((top._max.floor ?? 0) > data.totalFloors) throw new AppError("VALIDATION_ERROR", [{ path: "totalFloors", code: "below_existing_unit_floor" }]);
  }
  if (data.declaredUnits !== undefined) {
    const rowsNow = await db.unit.count({ where: { propertyId: id, archivedAt: null } });
    if (data.declaredUnits < rowsNow) throw new AppError("VALIDATION_ERROR", [{ path: "declaredUnits", code: "below_existing_units", units: rowsNow }]);
  }
  return db.$transaction(async (tx) => {
    const p = await tx.property.update({ where: { id }, data });
    await writeAudit({ actor, action: "property.update", resourceType: "Property", resourceId: id, after: data, req }, tx);
    return p;
  });
}

/** Soft delete. Blocked while any unit has an ACTIVE agreement. */
export async function archiveProperty(actor: Actor, id: string, reason: string, req: Request) {
  const p = await loadProperty(actor, id, "manage");
  if (p.archivedAt) return p;
  const active = await db.rentalAgreement.count({ where: { unit: { propertyId: id }, status: "ACTIVE" } });
  if (active > 0) throw new AppError("INVALID_STATE", { reason: "active_tenancies", count: active });
  return db.$transaction(async (tx) => {
    await tx.unit.updateMany({ where: { propertyId: id, archivedAt: null }, data: { archivedAt: new Date(), availability: "ARCHIVED" } });
    const out = await tx.property.update({ where: { id }, data: { archivedAt: new Date(), archiveReason: reason, status: "ARCHIVED" } });
    await writeAudit({ actor, action: "property.archive", resourceType: "Property", resourceId: id, after: { reason }, req }, tx);
    return out;
  });
}

export async function addImage(actor: Actor, id: string, input: z.infer<typeof imageSchema>) {
  await loadProperty(actor, id, "manage");
  // only the owner's own PROPERTY_IMAGE uploads may be attached
  if (keyPurpose(input.storageKey) !== "PROPERTY_IMAGE" || !keyBelongsTo(input.storageKey, actor.id)) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  const count = await db.propertyImage.count({ where: { propertyId: id } });
  if (count >= 20) throw new AppError("PLAN_LIMIT_REACHED", { kind: "image", cap: 20 });
  return db.propertyImage.create({ data: { propertyId: id, ...input } });
}

export async function removeImage(actor: Actor, id: string, imageId: string, req: Request) {
  await loadProperty(actor, id, "manage");
  const img = await db.propertyImage.findFirst({ where: { id: imageId, propertyId: id } });
  if (!img) throw new AppError("NOT_FOUND");
  await db.$transaction(async (tx) => {
    await tx.propertyImage.delete({ where: { id: imageId } });
    await writeAudit({ actor, action: "property.image.remove", resourceType: "Property", resourceId: id, after: { imageId }, req }, tx);
  });
  await supabaseAdmin().storage.from(BUCKET).remove([img.storageKey]).catch(() => undefined); // the row is gone either way
  return { removed: true };
}
