import { Prisma } from "@prisma/client";
import { authorize, requireRole } from "@/lib/authz/authorize";
import { signStorageKey } from "@/modules/uploads/service";
import { assignTenantInTx } from "@/modules/tenancy/assign";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { assertEntitlement } from "@/lib/authz/entitlement";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { loadProperty, loadUnit } from "./access";
import type { assignTenantSchema, ownerUnitsQuery, unitCreateSchema, unitListQuery, unitUpdateSchema } from "./schema";

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
      const { tenantId, startDate, endDate, members, ...fields } = input;
      const u = await tx.unit.create({ data: { ...fields, propertyId } });
      await writeAudit({ actor, action: "unit.create", resourceType: "Unit", resourceId: u.id, req }, tx);
      if (!tenantId) return u;
      await assignTenantInTx(tx, actor, u.id, tenantId, { startDate, endDate, members, req });
      return tx.unit.findUniqueOrThrow({ where: { id: u.id } }); // now OCCUPIED
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

/** Moves an existing tenant into a vacant unit (edit form of a vacant unit). */
export async function assignTenant(actor: Actor, unitId: string, input: z.infer<typeof assignTenantSchema>, req: Request) {
  await loadUnit(actor, unitId, "manage");
  return db.$transaction(async (tx) => assignTenantInTx(tx, actor, unitId, input.tenantId, { startDate: input.startDate, endDate: input.endDate, members: input.members, req }));
}

/**
 * Units Management list. Status shown to the owner: MAINTENANCE when the unit is flagged (availability
 * MAINTENANCE) or has a repair IN_PROGRESS, even if a tenant lives there; otherwise OCCUPIED or VACANT.
 * Filtering, searching and paging happen here, so the page works for any number of units.
 */
export async function listOwnerUnits(actor: Actor, q: z.infer<typeof ownerUnitsQuery>) {
  requireRole(actor, "OWNER");
  await authorize(actor, "unit:read", { ownerId: actor.id, readOnly: true });

  const flag: Prisma.UnitWhereInput = { OR: [{ availability: "MAINTENANCE" }, { maintenance: { some: { status: "IN_PROGRESS" } } }] };
  const byStatus = {
    MAINTENANCE: flag,
    OCCUPIED: { availability: "OCCUPIED" as const, NOT: flag },
    VACANT: { availability: "AVAILABLE" as const, NOT: flag },
  };
  const base: Prisma.UnitWhereInput = { archivedAt: null, property: { ownerId: actor.id, archivedAt: null, ...(q.propertyId ? { id: q.propertyId } : {}) } };
  const where: Prisma.UnitWhereInput = {
    ...base,
    ...(q.q ? { unitNumber: { contains: q.q, mode: "insensitive" } } : {}),
    ...(q.status ? byStatus[q.status] : {}),
  };

  const [total, all, occupied, vacant, maintenance, rows] = await Promise.all([
    db.unit.count({ where }),
    db.unit.count({ where: base }),
    db.unit.count({ where: { ...base, ...byStatus.OCCUPIED } }),
    db.unit.count({ where: { ...base, ...byStatus.VACANT } }),
    db.unit.count({ where: { ...base, ...byStatus.MAINTENANCE } }),
    db.unit.findMany({
      where,
      orderBy: [{ property: { name: "asc" } }, { floor: "asc" }, { unitNumber: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { property: { select: { id: true, name: true, totalFloors: true, locationText: true, address: { select: { area: true, upazila: true, district: true } } } } },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [agreements, repairs] = await Promise.all([
    db.rentalAgreement.findMany({ where: { unitId: { in: ids }, status: "ACTIVE" }, select: { id: true, unitId: true, tenantId: true } }),
    db.maintenanceRequest.groupBy({ by: ["unitId"], where: { unitId: { in: ids }, status: "IN_PROGRESS" }, _count: { _all: true } }),
  ]);
  const people = new Map((await db.user.findMany({ where: { id: { in: agreements.map((a) => a.tenantId) } }, select: { id: true, fullName: true, phone: true, avatarKey: true } })).map((p) => [p.id, p]));
  const agreementOf = new Map(agreements.map((a) => [a.unitId, a]));
  const repairsOf = new Map(repairs.map((r) => [r.unitId, r._count._all]));

  const items = await Promise.all(
    rows.map(async (r) => {
      const ag = agreementOf.get(r.id);
      const person = ag ? people.get(ag.tenantId) : undefined;
      const flagged = r.availability === "MAINTENANCE" || (repairsOf.get(r.id) ?? 0) > 0;
      const a = r.property.address;
      return {
        id: r.id, unitNumber: r.unitNumber, floor: r.floor, bedrooms: r.bedrooms, bathrooms: r.bathrooms, diningRooms: r.diningRooms, kitchens: r.kitchens,
        areaSqft: r.areaSqft, rent: r.rent.toFixed(2), deposit: r.deposit.toFixed(2), utilityCharge: r.utilityCharge.toFixed(2), furnishing: r.furnishing,
        availability: r.availability,
        status: flagged ? ("MAINTENANCE" as const) : r.availability === "OCCUPIED" ? ("OCCUPIED" as const) : ("VACANT" as const),
        property: { id: r.property.id, name: r.property.name, totalFloors: r.property.totalFloors, locationLabel: r.property.locationText || (a ? [a.area, a.upazila, a.district].filter(Boolean).join(", ") : "") },
        agreementId: ag?.id ?? null,
        tenant: person ? { id: person.id, fullName: person.fullName, phone: person.phone, avatarUrl: person.avatarKey ? await signStorageKey(person.avatarKey, 3600).then((s) => s.url).catch(() => null) : null } : null,
      };
    }),
  );

  return { items, total, page: q.page, pageSize: q.pageSize, counts: { all, occupied, vacant, maintenance } };
}
