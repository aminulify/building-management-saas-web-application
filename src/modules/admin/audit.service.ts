import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authz/authorize";
import { writeAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, uuid, type pageQuery } from "@/lib/api/common";
import { ROLES } from "@/shared/roles";

export const auditQuery = z.object({
  actorId: uuid.optional(),
  role: z.enum(ROLES).optional(),
  action: z.string().trim().max(60).optional(),
  resourceType: z.string().trim().max(60).optional(),
  resourceId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Super Admin: everything. Gov Admin: only their own actions (matrix: audit:read = own). The log is append-only. */
function where(actor: Actor, q: z.infer<typeof auditQuery>) {
  return {
    ...(actor.role === "GOV_ADMIN" ? { actorId: actor.id } : { actorId: q.actorId }),
    actorRole: q.role, resourceType: q.resourceType, resourceId: q.resourceId,
    ...(q.action ? { action: { contains: q.action } } : {}),
    ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
  };
}

export async function listAudit(actor: Actor, q: z.infer<typeof auditQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "audit:read", { ownerId: actor.id });
  const rows = await db.auditLog.findMany({ where: where(actor, q), ...pageArgs(page) });
  return pageResult(rows, page.limit);
}

export async function exportAudit(actor: Actor, q: z.infer<typeof auditQuery>, req: Request) {
  await authorize(actor, "audit:read", { ownerId: actor.id });
  const rows = await db.auditLog.findMany({ where: where(actor, q), orderBy: { id: "desc" }, take: 5000 });
  await writeAudit({ actor, action: "audit.export", resourceType: "AuditLog", after: { rows: rows.length }, req });
  return toCsv(rows.map((r) => ({ id: r.id, at: r.createdAt, actorId: r.actorId, role: r.actorRole, action: r.action, resourceType: r.resourceType, resourceId: r.resourceId, ip: r.ip, before: r.before, after: r.after })));
}
