import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";

/** Gov Admin oversight numbers. Finances are intentionally absent (no rent/revenue data for Gov Admin). */
export async function govDashboard(actor: Actor) {
  requireRole(actor, "GOV_ADMIN", "SUPER_ADMIN");
  const [owners, tenants, verifiedProperties, pendingComplaints, alerts, recentAlerts, recentActivity] = await Promise.all([
    db.user.count({ where: { role: "OWNER", status: "ACTIVE" } }),
    db.user.count({ where: { role: "TENANT", status: "ACTIVE" } }),
    db.property.count({ where: { verificationStatus: "VERIFIED", archivedAt: null } }),
    db.complaint.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "REOPENED"] }, ...(actor.role === "GOV_ADMIN" ? { assignedToId: actor.id } : {}) } }),
    db.emergencyAlert.groupBy({ by: ["status"], _count: { _all: true } }),
    db.emergencyAlert.findMany({ where: { status: { in: ["NEED_ACTION", "PROCESSING"] } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, status: true, createdAt: true, escalated: true } }),
    db.auditLog.findMany({ where: { actorId: actor.id }, orderBy: { id: "desc" }, take: 10, select: { action: true, resourceType: true, resourceId: true, createdAt: true } }),
  ]);
  const by = Object.fromEntries(alerts.map((a) => [a.status, a._count._all]));
  return {
    registeredOwners: owners,
    registeredTenants: tenants,
    verifiedProperties,
    pendingComplaints,
    emergencyAlerts: { total: alerts.reduce((s, a) => s + a._count._all, 0), needAction: by.NEED_ACTION ?? 0, processing: by.PROCESSING ?? 0 },
    activeIncidents: (by.NEED_ACTION ?? 0) + (by.PROCESSING ?? 0),
    resolvedIncidents: by.SOLVED ?? 0,
    recentAlerts,
    recentActivity,
  };
}
