import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { assertEntitlement } from "@/lib/authz/entitlement";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { loadProperty, loadUnit } from "./access";
import type { unitCreateSchema, unitListQuery, unitUpdateSchema } from "./schema";

export async function listUnits(actor: Actor, propertyId: string, q: z.infer<typeof unitListQuery>, page: z.infer<typeof pageQuery>) {
  await loadProperty(actor, propertyId, "read");
  const rows = await db.unit.findMany({
    where: { propertyId, floor: q.floor, availability: q.availability ?? { not: "ARCHIVED" } },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

/** Per-floor roll-up: unit count, occupancy, total square footage and expected rent. */
export async function listFloors(actor: Actor, propertyId: string) {
  const p = await loadProperty(actor, propertyId, "read");
  const units = await db.unit.findMany({ where: { propertyId, archivedAt: null }, orderBy: { floor: "asc" } });
  const floors = Array.from({ length: p.totalFloors + 1 }, (_, floor) => {
    const here = units.filter((u) => u.floor === floor);
    return {
      floor,
      unitCount: here.length,
      occupied: here.filter((u) => u.availability === "OCCUPIED").length,
      available: here.filter((u) => u.availability === "AVAILABLE").length,
      totalAreaSqft: here.reduce((s, u) => s + (u.areaSqft ?? 0), 0),
      totalRent: here.reduce((s, u) => s + Number(u.rent), 0).toFixed(2),
    };
  });
  return { propertyId, totalFloors: p.totalFloors, floors };
}

export async function createUnit(actor: Actor, propertyId: string, input: z.infer<typeof unitCreateSchema>, req: Request) {
  const p = await loadProperty(actor, propertyId, "manage");
  if (p.archivedAt || p.status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "property_not_active" });
  if (input.floor > p.totalFloors) throw new AppError("VALIDATION_ERROR", [{ path: "floor", code: "exceeds_total_floors" }]);
  try {
    return await db.$transaction(async (tx) => {
      await assertEntitlement(actor, "unit", { tx });
      const u = await tx.unit.create({ data: { ...input, propertyId } });
      await writeAudit({ actor, action: "unit.create", resourceType: "Unit", resourceId: u.id, req }, tx);
      return u;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { field: "unitNumber" });
    throw e;
  }
}

export async function getUnit(actor: Actor, id: string) {
  await loadUnit(actor, id, "read");
  return db.unit.findUnique({ where: { id }, include: { property: { select: { id: true, name: true, totalFloors: true } } } });
}

export async function updateUnit(actor: Actor, id: string, data: z.infer<typeof unitUpdateSchema>, req: Request) {
  const unit = await loadUnit(actor, id, "manage");
  if (unit.archivedAt) throw new AppError("INVALID_STATE", { reason: "archived" });
  if (data.floor !== undefined && data.floor > unit.property.totalFloors) throw new AppError("VALIDATION_ERROR", [{ path: "floor", code: "exceeds_total_floors" }]);
  if (data.availability && unit.availability === "OCCUPIED") throw new AppError("INVALID_STATE", { reason: "occupied" });
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.unit.update({ where: { id }, data });
      await writeAudit({ actor, action: "unit.update", resourceType: "Unit", resourceId: id, after: data as Prisma.InputJsonValue, req }, tx);
      return u;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { field: "unitNumber" });
    throw e;
  }
}

export async function archiveUnit(actor: Actor, id: string, req: Request) {
  const unit = await loadUnit(actor, id, "manage");
  if (unit.availability === "OCCUPIED") throw new AppError("INVALID_STATE", { reason: "occupied" });
  return db.$transaction(async (tx) => {
    const u = await tx.unit.update({ where: { id }, data: { archivedAt: new Date(), availability: "ARCHIVED" } });
    await writeAudit({ actor, action: "unit.archive", resourceType: "Unit", resourceId: id, req }, tx);
    return u;
  });
}

export async function markAvailable(actor: Actor, id: string, req: Request) {
  const unit = await loadUnit(actor, id, "manage");
  if (unit.archivedAt) throw new AppError("INVALID_STATE", { reason: "archived" });
  const active = await db.rentalAgreement.count({ where: { unitId: id, status: "ACTIVE" } });
  if (active > 0) throw new AppError("INVALID_STATE", { reason: "active_tenancy" });
  return db.$transaction(async (tx) => {
    const u = await tx.unit.update({ where: { id }, data: { availability: "AVAILABLE" } });
    await writeAudit({ actor, action: "unit.mark_available", resourceType: "Unit", resourceId: id, req }, tx);
    return u;
  });
}
