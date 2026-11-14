import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/authz/authorize";
import { listPropertiesCore, propertyOverviewCore, propertyStatsCore, type adminPropertiesQuery } from "@/modules/admin/properties/service";
import type { Actor } from "@/lib/auth/require-actor";
import type { z } from "zod";

/**
 * Government Admin → All Properties. Read-only: the same figures the Super Admin sees, plus what regulators need
 * (approval counts, flagged properties, documents and the audit trail). A Government Admin can flag a property
 * (POST /gov/properties/:id/report) but never approves, edits or deletes it.
 */
const LIVE = { archivedAt: null } as const;
const OPEN_ALERTS = ["NEED_ACTION", "PROCESSING"] as const;

export async function govPropertyStats(actor: Actor) {
  requireRole(actor, "GOV_ADMIN");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [core, verified, rejected, suspended, newThisMonth, flagged, openAlerts] = await Promise.all([
    propertyStatsCore(),
    db.property.count({ where: { ...LIVE, status: "ACTIVE", verificationStatus: "VERIFIED" } }),
    db.property.count({ where: { ...LIVE, verificationStatus: "REJECTED" } }),
    db.property.count({ where: { ...LIVE, status: { not: "ACTIVE" } } }),
    db.property.count({ where: { ...LIVE, createdAt: { gte: monthStart } } }),
    db.auditLog.groupBy({ by: ["resourceId"], where: { action: "property.report_issue", resourceType: "Property", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    db.emergencyAlert.count({ where: { status: { in: [...OPEN_ALERTS] } } }),
  ]);
  return { ...core, vacantUnits: Math.max(0, core.totalUnits - core.occupiedUnits), verified, rejected, suspended, newThisMonth, flaggedLast30: flagged.length, openAlerts };
}

/** The sidebar badge: is there any open emergency alert? */
export async function govSummary(actor: Actor) {
  requireRole(actor, "GOV_ADMIN");
  return { openAlerts: await db.emergencyAlert.count({ where: { status: { in: [...OPEN_ALERTS] } } }) };
}

export async function govPropertyList(actor: Actor, q: z.infer<typeof adminPropertiesQuery>) {
  requireRole(actor, "GOV_ADMIN");
  return listPropertiesCore(q);
}

/** Everything the View window shows: the property, the owner's profile, the government verification state, documents and the audit trail. */
export async function govPropertyDetails(actor: Actor, id: string) {
  requireRole(actor, "GOV_ADMIN");
  const o = await propertyOverviewCore(id);
  const [p, ownerRow, docs, logs, reports] = await Promise.all([
    db.property.findUnique({ where: { id }, select: { verificationStatus: true, reviewNotes: true, reviewedAt: true, status: true } }),
    db.user.findUnique({ where: { id: o.owner.id }, select: { email: true, verificationStatus: true, createdAt: true, status: true } }),
    db.verificationDocument.findMany({ where: { ownerType: "PROPERTY", ownerId: id }, orderBy: { id: "desc" }, take: 20, select: { id: true, kind: true, status: true, notes: true, createdAt: true } }),
    db.auditLog.findMany({ where: { resourceType: "Property", resourceId: id, action: { startsWith: "property." } }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.auditLog.count({ where: { resourceType: "Property", resourceId: id, action: "property.report_issue" } }),
  ]);
  if (!p) throw new AppError("NOT_FOUND");
  const actors = await db.user.findMany({ where: { id: { in: logs.flatMap((l) => (l.actorId ? [l.actorId] : [])) } }, select: { id: true, fullName: true, role: true } });
  return {
    ...o,
    owner: { ...o.owner, email: ownerRow?.email ?? null, verificationStatus: ownerRow?.verificationStatus ?? "UNVERIFIED", joinedAt: ownerRow?.createdAt ?? null, accountStatus: ownerRow?.status ?? "ACTIVE" },
    verification: { status: p.verificationStatus, notes: p.reviewNotes, reviewedAt: p.reviewedAt, propertyStatus: p.status },
    documents: docs, issueReports: reports,
    audit: logs.map((l) => {
      const after = (l.after ?? {}) as Record<string, unknown>;
      const who = actors.find((a) => a.id === l.actorId);
      return { id: l.id, action: l.action, at: l.createdAt, by: who ? { name: who.fullName, role: who.role } : null, notes: typeof after.notes === "string" ? after.notes : null, reason: typeof after.reason === "string" ? after.reason : null };
    }),
  };
}
