import type { MaintenanceStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { removeStorageKeys, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import type { MaintenanceAction, actionBodySchema, maintenanceCreateSchema, maintenanceListQuery } from "./schema";

/** action → allowed source states, target state, and who may do it. */
const FLOW: Record<MaintenanceAction, { from: MaintenanceStatus[]; to: MaintenanceStatus; by: "owner" | "tenant" }> = {
  approve: { from: ["PENDING"], to: "APPROVED", by: "owner" },
  reject: { from: ["PENDING"], to: "REJECTED", by: "owner" },
  assign: { from: ["APPROVED", "IN_PROGRESS"], to: "IN_PROGRESS", by: "owner" },
  status: { from: ["APPROVED"], to: "IN_PROGRESS", by: "owner" },
  complete: { from: ["APPROVED", "IN_PROGRESS"], to: "COMPLETED", by: "owner" },
  cancel: { from: ["PENDING", "APPROVED"], to: "CANCELLED", by: "tenant" },
};

export async function createRequest(actor: Actor, input: z.infer<typeof maintenanceCreateSchema>, req: Request) {
  await authorize(actor, "maintenance:create", { ownerId: actor.id });
  const agreement = await db.rentalAgreement.findFirst({ where: { tenantId: actor.id, status: "ACTIVE" } });
  if (!agreement) throw new AppError("INVALID_STATE", { reason: "no_active_tenancy" });
  const { images, ...rest } = input;
  return db.$transaction(async (tx) => {
    const r = await tx.maintenanceRequest.create({
      data: { ...rest, agreementId: agreement.id, unitId: agreement.unitId, tenantId: actor.id, images: { create: images.map((storageKey) => ({ storageKey })) } },
      include: { images: true },
    });
    const where = await unitLabel(tx, agreement.unitId);
    await notify([agreement.ownerId], { type: "maintenance.new", titleKey: "notifications.maintenanceNew", params: { title: r.title, tenantName: actor.fullName, unit: where.unit, property: where.property, requestId: r.id, priority: r.priority }, link: `/owner/maintenance`, priority: r.priority === "CRITICAL" ? "CRITICAL" : r.priority === "HIGH" ? "HIGH" : "NORMAL" }, tx);
    await writeAudit({ actor, action: "maintenance.create", resourceType: "MaintenanceRequest", resourceId: r.id, req }, tx);
    return r;
  });
}

/** Unit number and property name, for notifications that must say where the problem is. */
async function unitLabel(tx: Prisma.TransactionClient, unitId: string) {
  const u = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, select: { unitNumber: true, property: { select: { name: true } } } });
  return { unit: u.unitNumber, property: u.property.name };
}

async function load(actor: Actor, id: string, mode: "read" | "manage" | "comment") {
  const r = await db.maintenanceRequest.findUnique({ where: { id }, include: { agreement: true } });
  if (!r) throw new AppError("NOT_FOUND");
  // owner/tenant/super: manage scope; gov: read-only. Tenant `own` scope is matched on tenantId.
  const ownerId = actor.role === "TENANT" ? r.tenantId : r.agreement.ownerId;
  await authorize(actor, "maintenance:manage", { ownerId, readOnly: mode === "read" });
  return r;
}

export async function listRequests(actor: Actor, q: z.infer<typeof maintenanceListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "maintenance:manage", { ownerId: actor.id, readOnly: true });
  const scope = actor.role === "OWNER" ? { agreement: { ownerId: actor.id } } : actor.role === "TENANT" ? { tenantId: actor.id } : {};
  const rows = await db.maintenanceRequest.findMany({
    where: { ...scope, status: q.statuses?.length ? { in: q.statuses } : q.status, category: q.category, unitId: q.unitId },
    include: {
      unit: { select: { unitNumber: true, floor: true, property: { select: { name: true } } } },
      images: { take: 1, orderBy: { id: "asc" }, select: { storageKey: true } },
    },
    ...pageArgs(page),
  });
  const res = pageResult(rows, page.limit);
  const covers = await signStorageKeys(res.items.flatMap((r) => r.images.map((i) => i.storageKey)), 3600);
  const people = new Map((await db.user.findMany({ where: { id: { in: [...new Set(res.items.map((r) => r.tenantId))] } }, select: { id: true, fullName: true, username: true, phone: true } })).map((u) => [u.id, u]));
  const sees = actor.role === "OWNER" || actor.role === "SUPER_ADMIN"; // the tenant's phone is for the landlord, not for read-only roles
  return {
    ...res,
    items: res.items.map(({ images, ...r }) => {
      const t = people.get(r.tenantId);
      return { ...r, coverUrl: (images[0] && covers.get(images[0].storageKey)) || null, tenant: { id: r.tenantId, fullName: t?.fullName ?? "", username: t?.username ?? "", phone: sees ? (t?.phone ?? null) : null } };
    }),
  };
}

export async function getRequest(actor: Actor, id: string) {
  const r0 = await load(actor, id, "read");
  const r = await db.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { images: true, comments: { orderBy: { id: "asc" } }, unit: { select: { unitNumber: true, floor: true, property: { select: { name: true } } } } } });
  const [tenant, urls] = await Promise.all([
    db.user.findUnique({ where: { id: r0.tenantId }, select: { id: true, fullName: true, username: true, phone: true } }),
    signStorageKeys(r.images.map((i) => i.storageKey), 3600),
  ]);
  const sees = actor.role === "OWNER" || actor.role === "SUPER_ADMIN"; // the tenant's phone is for the landlord
  return {
    ...r,
    images: r.images.map((i) => ({ ...i, url: urls.get(i.storageKey) ?? null })),
    tenant: { id: r0.tenantId, fullName: tenant?.fullName ?? "", username: tenant?.username ?? "", phone: sees ? (tenant?.phone ?? null) : null },
  };
}

export async function transition(actor: Actor, id: string, action: MaintenanceAction, body: z.infer<typeof actionBodySchema>, req: Request) {
  const r = await load(actor, id, "manage");
  const isOwnerSide = actor.role === "OWNER" || actor.role === "SUPER_ADMIN";
  // "status" with a target (the pill on the Maintenance page): Pending, In Progress or Completed from any of those
  const direct = action === "status" && body.status;
  const rule = direct
    ? { from: ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"] as MaintenanceStatus[], to: body.status as MaintenanceStatus, by: "owner" as const }
    : FLOW[action];
  if (direct && isOwnerSide && r.status === rule.to) { const { agreement: _a, ...same } = r; return same; } // nothing to change, nobody to notify
  if (rule.by === "owner" ? !isOwnerSide : actor.role !== "TENANT") throw new AppError("FORBIDDEN", { action });
  if (!rule.from.includes(r.status)) throw new AppError("INVALID_STATE", { from: r.status, action });
  if (action === "assign" && !body.technicianName) throw new AppError("VALIDATION_ERROR", [{ path: "technicianName", code: "required" }]);
  if (action === "reject" && !body.reason) throw new AppError("VALIDATION_ERROR", [{ path: "reason", code: "required" }]);

  return db.$transaction(async (tx) => {
    const out = await tx.maintenanceRequest.update({
      where: { id },
      data: { status: rule.to, ...(body.technicianName ? { technicianName: body.technicianName } : {}) },
    });
    if (action === "reject" && body.reason) await tx.maintenanceComment.create({ data: { requestId: id, authorId: actor.id, body: body.reason } });
    const notifyId = rule.by === "owner" ? r.tenantId : r.agreement.ownerId;
    const where = await unitLabel(tx, r.unitId);
    await notify([notifyId], { type: "maintenance.status", titleKey: "notifications.maintenanceStatus", params: { status: rule.to, title: r.title, unit: where.unit, property: where.property, requestId: r.id } }, tx);
    await writeAudit({ actor, action: `maintenance.${action}`, resourceType: "MaintenanceRequest", resourceId: id, before: { status: r.status }, after: { status: rule.to }, req }, tx);
    return out;
  });
}

export async function addComment(actor: Actor, id: string, body: string) {
  const r = await load(actor, id, "comment");
  if (actor.role === "GOV_ADMIN") throw new AppError("FORBIDDEN");
  const c = await db.maintenanceComment.create({ data: { requestId: id, authorId: actor.id, body } });
  const where = await unitLabel(db, r.unitId);
  await notify([actor.id === r.tenantId ? r.agreement.ownerId : r.tenantId], { type: "maintenance.comment", titleKey: "notifications.maintenanceComment", params: { title: r.title, tenantName: actor.fullName, unit: where.unit, property: where.property, requestId: r.id }, link: "/owner/maintenance" });
  return c;
}

/** Owner removes a request for good (photos and comments with it); the tenant is told. */
export async function deleteRequest(actor: Actor, id: string, req: Request) {
  const r = await load(actor, id, "manage");
  if (actor.role !== "OWNER" && actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  const images = await db.maintenanceImage.findMany({ where: { requestId: id }, select: { storageKey: true } });
  await db.$transaction(async (tx) => {
    await tx.maintenanceComment.deleteMany({ where: { requestId: id } });
    await tx.maintenanceImage.deleteMany({ where: { requestId: id } });
    await tx.maintenanceRequest.delete({ where: { id } });
    await notify([r.tenantId], { type: "maintenance.deleted", titleKey: "notifications.maintenanceDeleted", params: { title: r.title } }, tx);
    await writeAudit({ actor, action: "maintenance.delete", resourceType: "MaintenanceRequest", resourceId: id, before: { status: r.status, title: r.title, priority: r.priority }, req }, tx);
  });
  if (images.length) await removeStorageKeys(images.map((i) => i.storageKey)).catch(() => undefined); // a failure only leaves an orphan file
  return { deleted: true };
}

/** Category shares are normalised to sum to 100 (largest-remainder) so charts never show 99/101. */
export async function stats(actor: Actor) {
  await authorize(actor, "maintenance:manage", { ownerId: actor.id, readOnly: true });
  const where = actor.role === "OWNER" ? { agreement: { ownerId: actor.id } } : actor.role === "TENANT" ? { tenantId: actor.id } : {};
  const [byStatus, byCategory] = await Promise.all([
    db.maintenanceRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.maintenanceRequest.groupBy({ by: ["category"], where, _count: { _all: true } }),
  ]);
  const total = byCategory.reduce((s, c) => s + c._count._all, 0);
  const raw = byCategory.map((c) => ({ category: c.category, count: c._count._all, exact: total ? (c._count._all * 100) / total : 0 }));
  const floors = raw.map((r) => Math.floor(r.exact));
  let left = total ? 100 - floors.reduce((a, b) => a + b, 0) : 0;
  [...raw.keys()].sort((a, b) => (raw[b]!.exact % 1) - (raw[a]!.exact % 1)).forEach((i) => { if (left-- > 0) floors[i]!++; });
  const completed = byStatus.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
  const n = (...st: string[]) => byStatus.filter((s) => st.includes(s.status)).reduce((a, s) => a + s._count._all, 0);
  const critical = await db.maintenanceRequest.count({ where: { ...where, priority: "CRITICAL", status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } } });
  return {
    total,
    /** the three cards of the Maintenance page */
    open: n("PENDING", "APPROVED"), inProgress: n("IN_PROGRESS"), critical,
    resolutionRate: total ? Math.round((completed * 100) / total) : 0,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byCategory: raw.map((r, i) => ({ category: r.category, count: r.count, percent: floors[i] })),
  };
}
