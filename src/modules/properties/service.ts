import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { setPoint } from "@/lib/geo-point";
import { assertEntitlement } from "@/lib/authz/entitlement";
import { authorize } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { loadProperty } from "./access";
import type { imageSchema, propertyCreateSchema, propertyListQuery, propertyUpdateSchema } from "./schema";

export async function listProperties(actor: Actor, q: z.infer<typeof propertyListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "property:read", { ownerId: actor.id, readOnly: true });
  const rows = await db.property.findMany({
    where: {
      ...(actor.role === "OWNER" ? { ownerId: actor.id } : {}),
      status: q.status,
      ...(q.includeArchived ? {} : { archivedAt: null }),
    },
    include: { _count: { select: { units: true } }, address: true },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
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
  const { address, lat, lng, ...rest } = input;
  return db.$transaction(async (tx) => {
    await assertEntitlement(actor, "property", { tx });
    const addr = await tx.address.create({ data: address });
    const p = await tx.property.create({
      data: { ...rest, ownerId: actor.id, addressId: addr.id },
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
  const count = await db.propertyImage.count({ where: { propertyId: id } });
  if (count >= 20) throw new AppError("PLAN_LIMIT_REACHED", { kind: "image", cap: 20 });
  return db.propertyImage.create({ data: { propertyId: id, ...input } });
}
