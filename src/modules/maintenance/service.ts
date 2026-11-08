import type { MaintenanceStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
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
    await notify([agreement.ownerId], { type: "maintenance.new", titleKey: "notifications.maintenanceNew", params: { title: r.title }, link: `/owner/maintenance/${r.id}` }, tx);
    await writeAudit({ actor, action: "maintenance.create", resourceType: "MaintenanceRequest", resourceId: r.id, req }, tx);
    return r;
  });
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
    where: { ...scope, status: q.status, category: q.category, unitId: q.unitId },
    include: { unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

export async function getRequest(actor: Actor, id: string) {
  await load(actor, id, "read");
  return db.maintenanceRequest.findUnique({ where: { id }, include: { images: true, comments: { orderBy: { id: "asc" } }, unit: { select: { unitNumber: true } } } });
}

export async function transition(actor: Actor, id: string, action: MaintenanceAction, body: z.infer<typeof actionBodySchema>, req: Request) {
  const r = await load(actor, id, "manage");
  const rule = FLOW[action];
  const isOwnerSide = actor.role === "OWNER" || actor.role === "SUPER_ADMIN";
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
    await notify([notifyId], { type: "maintenance.status", titleKey: "notifications.maintenanceStatus", params: { status: rule.to, title: r.title } }, tx);
    await writeAudit({ actor, action: `maintenance.${action}`, resourceType: "MaintenanceRequest", resourceId: id, before: { status: r.status }, after: { status: rule.to }, req }, tx);
    return out;
  });
}

export async function addComment(actor: Actor, id: string, body: string) {
  const r = await load(actor, id, "comment");
  if (actor.role === "GOV_ADMIN") throw new AppError("FORBIDDEN");
  const c = await db.maintenanceComment.create({ data: { requestId: id, authorId: actor.id, body } });
  await notify([actor.id === r.tenantId ? r.agreement.ownerId : r.tenantId], { type: "maintenance.comment", titleKey: "notifications.maintenanceComment", params: { title: r.title } });
  return c;
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
  return {
    total,
    resolutionRate: total ? Math.round((completed * 100) / total) : 0,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byCategory: raw.map((r, i) => ({ category: r.category, count: r.count, percent: floors[i] })),
  };
}
