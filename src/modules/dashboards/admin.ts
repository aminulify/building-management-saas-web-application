import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";

const toMap = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) => Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));

export async function adminDashboard(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const now = new Date();
  const monthFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sixMonths = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [usersByRole, usersByStatus, subs, plans, revenueAll, revenueMonth, payments6m, pending, oldestPending, listings, openComplaints, alerts, properties, units] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.user.groupBy({ by: ["status"], _count: { _all: true } }),
    db.userSubscription.groupBy({ by: ["planId", "status"], where: { status: { in: ["ACTIVE", "GRACE"] } }, _count: { _all: true } }),
    db.subscriptionPlan.findMany({ select: { id: true, code: true } }),
    db.paymentTransaction.aggregate({ where: { status: "SUCCESS", purpose: "SUBSCRIPTION" }, _sum: { amount: true } }),
    db.paymentTransaction.aggregate({ where: { status: "SUCCESS", purpose: "SUBSCRIPTION", verifiedAt: { gte: monthFrom } }, _sum: { amount: true } }),
    db.paymentTransaction.findMany({ where: { status: "SUCCESS", purpose: "SUBSCRIPTION", verifiedAt: { gte: sixMonths } }, select: { amount: true, verifiedAt: true } }),
    db.upgradeRequest.count({ where: { status: "PENDING" } }),
    db.upgradeRequest.findFirst({ where: { status: "PENDING" }, orderBy: { id: "asc" }, select: { createdAt: true } }),
    db.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    db.complaint.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "REOPENED"] } } }),
    db.emergencyAlert.groupBy({ by: ["status"], _count: { _all: true } }),
    db.property.count({ where: { archivedAt: null } }),
    db.unit.count({ where: { archivedAt: null } }),
  ]);

  const planCode = new Map(plans.map((p) => [p.id, p.code]));
  const subscribersByPlan: Record<string, number> = {};
  for (const s of subs) subscribersByPlan[planCode.get(s.planId) ?? s.planId] = (subscribersByPlan[planCode.get(s.planId) ?? s.planId] ?? 0) + s._count._all;

  const revenueTrend: Record<string, number> = {};
  for (const p of payments6m) {
    const k = p.verifiedAt!.toISOString().slice(0, 7);
    revenueTrend[k] = (revenueTrend[k] ?? 0) + Number(p.amount);
  }

  return {
    users: { byRole: toMap(usersByRole, "role"), byStatus: toMap(usersByStatus, "status") },
    revenue: {
      currency: "BDT", total: revenueAll._sum.amount?.toFixed(2) ?? "0.00", thisMonth: revenueMonth._sum.amount?.toFixed(2) ?? "0.00",
      trend: Object.entries(revenueTrend).sort().map(([month, amount]) => ({ month, amount: amount.toFixed(2) })),
    },
    subscriptions: { activeByPlan: subscribersByPlan },
    pendingUpgrades: { count: pending, oldestWaitingHours: oldestPending ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 3600_000) : 0 },
    marketplace: { listingsByStatus: toMap(listings, "status") },
    portfolio: { properties, units },
    openComplaints,
    emergency: toMap(alerts, "status"),
  };
}
