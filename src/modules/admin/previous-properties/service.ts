import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { archiveBuilding } from "../properties/service";
import { ARCHIVE_REASONS, REASON_TEXT } from "@/modules/properties/archive-reasons";

/** Super Admin → Previous Properties: every property that is no longer live (archived, suspended, inactive or deleted). */
export const PAGE_SIZE = 10;
export const REASONS = ARCHIVE_REASONS;
export const ARCHIVE_STATUSES = ["ARCHIVED", "SUSPENDED", "INACTIVE", "DELETED"] as const;
export const SET_STATUSES = ["ACTIVE", ...ARCHIVE_STATUSES] as const;
export type ArchiveReason = (typeof REASONS)[number];

export const archiveListQuery = z.object({
  status: z.enum(["all", ...ARCHIVE_STATUSES]).default("all"),
  reason: z.enum(["all", ...REASONS]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

export const archiveStatusSchema = z
  .object({ status: z.enum(SET_STATUSES), reason: z.enum(REASONS).optional(), note: z.string().trim().max(300).optional() })
  .strict()
  .refine((v) => v.status === "ACTIVE" || !!v.reason, { path: ["reason"], message: "reason_required" });

const inArchive: Prisma.PropertyWhereInput = { OR: [{ archivedAt: { not: null } }, { status: { in: [...ARCHIVE_STATUSES] } }] };
const joinPlace = (a: { area: string | null; upazila: string | null; district: string; division: string } | null) => (a ? [a.area, a.upazila, a.district, a.division].filter(Boolean).join(", ") : "");
const ownerCard = { id: true, fullName: true, email: true, phone: true, ownerCode: true } as const;

/** The filters of the page: status, reason (rows without a code count as "Other"), and one search box over property, owner and place. */
export function archiveWhere(q: { status: string; reason: string; q?: string }): Prisma.PropertyWhereInput {
  const and: Prisma.PropertyWhereInput[] = [inArchive];
  if (q.status !== "all") and.push({ status: q.status as (typeof ARCHIVE_STATUSES)[number] });
  if (q.reason === "OTHER") and.push({ OR: [{ archiveReasonCode: "OTHER" }, { archiveReasonCode: null }] });
  else if (q.reason !== "all") and.push({ archiveReasonCode: q.reason });
  const text = q.q?.trim();
  if (text) {
    const has = { contains: text, mode: "insensitive" as const };
    and.push({ OR: [{ name: has }, { locationText: has }, { address: { OR: [{ area: has }, { upazila: has }, { district: has }] } }, { owner: { OR: [{ fullName: has }, { email: has }, { phone: { contains: text } }, { ownerCode: has }] } }] });
  }
  return { AND: and };
}

/** The numbers on top: one card per state, all records, and what was reactivated in the last 30 days. */
export async function archiveStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [groups, reactivated] = await Promise.all([
    db.property.groupBy({ by: ["status"], where: inArchive, _count: { _all: true } }),
    db.auditLog.count({ where: { action: "property.reactivate", resourceType: "Property", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { archived: n("ARCHIVED"), suspended: n("SUSPENDED"), inactive: n("INACTIVE"), deleted: n("DELETED"), total: groups.reduce((s, g) => s + g._count._all, 0), reactivated };
}

/** Rows of the table, newest first, 10 per page. */
export async function archiveList(actor: Actor, q: z.infer<typeof archiveListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const where = archiveWhere(q);
  const [rows, total] = await Promise.all([
    db.property.findMany({
      where, orderBy: [{ deactivatedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, name: true, status: true, archiveReason: true, archiveReasonCode: true, deactivatedAt: true, archivedAt: true, updatedAt: true, declaredUnits: true, locationText: true, owner: { select: ownerCard }, address: { select: { area: true, upazila: true, district: true, division: true } } },
    }),
    db.property.count({ where }),
  ]);
  const counts = await db.unit.groupBy({ by: ["propertyId"], where: { propertyId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  const items = rows.map(({ address, declaredUnits, locationText, archiveReasonCode, deactivatedAt, archivedAt, updatedAt, ...r }) => ({
    ...r, reasonCode: (archiveReasonCode ?? "OTHER") as ArchiveReason, deactivatedAt: deactivatedAt ?? archivedAt ?? updatedAt,
    location: locationText || joinPlace(address), units: Math.max(declaredUnits ?? 0, counts.find((c) => c.propertyId === r.id)?._count._all ?? 0),
  }));
  return { items, total, page: q.page, pageSize: PAGE_SIZE };
}

/** Everything the View / Edit / Delete windows show: the record, the owner, every unit and what happened to it. */
export async function archiveDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({
    where: { id, AND: [inArchive] },
    include: {
      owner: { select: { ...ownerCard, status: true, archivedAt: true } }, address: true,
      units: { orderBy: [{ floor: "asc" }, { unitNumber: "asc" }], take: 400, select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, rent: true, availability: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const unitRows = await db.unit.count({ where: { propertyId: id } });
  const logs = await db.auditLog.findMany({ where: { resourceType: "Property", resourceId: id, action: { startsWith: "property." } }, orderBy: { createdAt: "desc" }, take: 15 });
  const admins = await db.user.findMany({ where: { id: { in: logs.flatMap((l) => (l.actorId ? [l.actorId] : [])) } }, select: { id: true, fullName: true, role: true } });
  const history = logs.map((l) => {
    const after = (l.after ?? {}) as Record<string, unknown>;
    const who = admins.find((a) => a.id === l.actorId);
    return { id: l.id, action: l.action, at: l.createdAt, by: who ? { name: who.fullName, role: who.role } : null, status: typeof after.status === "string" ? after.status : null, reason: typeof after.reasonCode === "string" ? after.reasonCode : null };
  });
  const { owner, address, units, declaredUnits, archiveReasonCode, deactivatedAt, locationText, ...rest } = p;
  return {
    id: rest.id, name: rest.name, type: rest.type, description: rest.description, status: rest.status, totalFloors: rest.totalFloors, createdAt: rest.createdAt,
    location: locationText || joinPlace(address), address, reasonCode: (archiveReasonCode ?? "OTHER") as ArchiveReason, reasonNote: rest.archiveReason,
    deactivatedAt: deactivatedAt ?? rest.archivedAt ?? rest.updatedAt, totalUnits: Math.max(declaredUnits ?? 0, unitRows),
    owner: { id: owner.id, fullName: owner.fullName, email: owner.email, phone: owner.phone, ownerCode: owner.ownerCode, ready: owner.status === "ACTIVE" && !owner.archivedAt },
    units: units.map((u) => ({ ...u, rent: u.rent.toString() })), history,
  };
}

/** Units that went into the archive together with the building come back with it (a minute either side of the archive time). */
async function restoreUnits(tx: Prisma.TransactionClient, propertyId: string, archivedAt: Date) {
  await tx.unit.updateMany({
    where: { propertyId, archivedAt: { gte: new Date(archivedAt.getTime() - 60_000), lte: new Date(archivedAt.getTime() + 60_000) } },
    data: { archivedAt: null, availability: "AVAILABLE" },
  });
}

const NOTICE = { ACTIVE: "notifications.propertyReactivated", SUSPENDED: "notifications.propertySuspended", INACTIVE: "notifications.propertyInactive", ARCHIVED: "notifications.propertyArchivedByAdmin", DELETED: "notifications.propertyRemoved" } as const;

/** Edit status & reactivate: Active brings the building back to the live lists; the other states take it out. The owner is told either way. */
export async function setArchiveStatus(actor: Actor, id: string, input: z.infer<typeof archiveStatusSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({ where: { id, AND: [inArchive] }, include: { owner: { select: { status: true, archivedAt: true } } } });
  if (!p) throw new AppError("NOT_FOUND");
  const code = input.status === "ACTIVE" ? null : (input.reason ?? "OTHER");
  const changed = p.status !== input.status;
  if (input.status === "ACTIVE" && (p.owner.status !== "ACTIVE" || p.owner.archivedAt)) throw new AppError("INVALID_STATE", { reason: "owner_not_active" });
  if (!changed && (p.archiveReasonCode ?? "OTHER") === code && !input.note) return { id, status: p.status, changed: false };

  const now = new Date();
  const movedOut = await db.$transaction(async (tx) => {
    let moved = 0;
    const data: Prisma.PropertyUpdateInput = { status: input.status };
    if (input.status === "ACTIVE") {
      if (p.archivedAt) await restoreUnits(tx, id, p.archivedAt);
      Object.assign(data, { archivedAt: null, archiveReason: null, archiveReasonCode: null, deactivatedAt: null });
    } else {
      const toArchive = input.status === "ARCHIVED" || input.status === "DELETED";
      if (toArchive && !p.archivedAt) { moved = await archiveBuilding(tx, id, actor, req, now); data.archivedAt = now; }
      if (!toArchive && p.archivedAt) { await restoreUnits(tx, id, p.archivedAt); data.archivedAt = null; }
      Object.assign(data, { archiveReasonCode: code, archiveReason: input.note || REASON_TEXT[code as ArchiveReason], deactivatedAt: changed || !p.deactivatedAt ? now : p.deactivatedAt });
    }
    await tx.property.update({ where: { id }, data });
    if (changed) await notify([p.ownerId], { type: "property.review", titleKey: NOTICE[input.status], params: { name: p.name }, link: "/home-owner/properties" }, tx);
    await writeAudit({ actor, action: input.status === "ACTIVE" ? "property.reactivate" : "property.status_change", resourceType: "Property", resourceId: id, before: { status: p.status, reasonCode: p.archiveReasonCode }, after: { status: input.status, reasonCode: code, tenantsMovedOut: moved }, req }, tx);
    return moved;
  });
  return { id, status: input.status, changed, tenantsMovedOut: movedOut };
}

/**
 * Delete from the archive. A record that nothing depends on is erased for good. One with history (agreements, rent, tickets, listings)
 * stays as a hidden "Deleted" record so the money and legal trail is never broken.
 */
export async function archiveDelete(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findFirst({ where: { id, AND: [inArchive] }, select: { id: true, name: true, ownerId: true, status: true, archivedAt: true, deactivatedAt: true } });
  if (!p) throw new AppError("NOT_FOUND");
  try {
    await db.$transaction(async (tx) => {
      await tx.verificationDocument.deleteMany({ where: { ownerType: "PROPERTY", ownerId: id } });
      await tx.propertyImage.deleteMany({ where: { propertyId: id } });
      await tx.unit.deleteMany({ where: { propertyId: id } });
      await tx.property.delete({ where: { id } });
      await notify([p.ownerId], { type: "property.review", titleKey: "notifications.propertyRemoved", params: { name: p.name } }, tx);
      await writeAudit({ actor, action: "property.purge", resourceType: "Property", resourceId: id, before: { name: p.name, status: p.status }, after: { purged: true }, req }, tx);
    });
    return { id, purged: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2003") throw e;
  }
  // history depends on it: keep the record, mark it Deleted
  if (p.status !== "DELETED") {
    const now = new Date();
    await db.$transaction(async (tx) => {
      const moved = p.archivedAt ? 0 : await archiveBuilding(tx, id, actor, req, now);
      await tx.property.update({ where: { id }, data: { status: "DELETED", archivedAt: p.archivedAt ?? now, deactivatedAt: now } });
      await notify([p.ownerId], { type: "property.review", titleKey: "notifications.propertyRemoved", params: { name: p.name } }, tx);
      await writeAudit({ actor, action: "property.delete", resourceType: "Property", resourceId: id, before: { status: p.status }, after: { status: "DELETED", tenantsMovedOut: moved }, req }, tx);
    });
  }
  return { id, purged: false };
}
