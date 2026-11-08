import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import { getEntitlement } from "@/lib/authz/entitlement";
import type { Actor } from "@/lib/auth/require-actor";
import { monthStart } from "@/modules/rent/billing";
import { ownerOverview } from "@/modules/rent/service";

const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) =>
  Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));

export async function ownerDashboard(actor: Actor) {
  requireRole(actor, "OWNER");
  const sixMonthsAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1));
  const in60 = new Date(Date.now() + 60 * 86400_000);

  const [properties, unitsBy, activeTenants, thisMonth, overdue, maintenance, entitlement, expiring, recentPayments, trend] = await Promise.all([
    db.property.count({ where: { ownerId: actor.id, archivedAt: null } }),
    db.unit.groupBy({ by: ["availability"], where: { property: { ownerId: actor.id }, archivedAt: null }, _count: { _all: true } }),
    db.rentalAgreement.count({ where: { ownerId: actor.id, status: "ACTIVE" } }),
    ownerOverview(actor, monthStart()),
    db.rentRecord.count({ where: { agreement: { ownerId: actor.id }, status: "OVERDUE" } }),
    db.maintenanceRequest.groupBy({ by: ["status"], where: { agreement: { ownerId: actor.id } }, _count: { _all: true } }),
    getEntitlement(actor.id, "OWNER"),
    db.rentalAgreement.count({ where: { ownerId: actor.id, status: "ACTIVE", endDate: { gte: new Date(), lte: in60 } } }),
    db.rentPayment.findMany({ where: { rentRecord: { agreement: { ownerId: actor.id } } }, orderBy: { id: "desc" }, take: 5, select: { id: true, amount: true, method: true, paidAt: true } }),
    db.rentRecord.groupBy({ by: ["billingMonth"], where: { agreement: { ownerId: actor.id }, billingMonth: { gte: sixMonthsAgo } }, _sum: { total: true, paid: true }, orderBy: { billingMonth: "asc" } }),
  ]);

  const units = count(unitsBy, "availability");
  const totalUnits = Object.values(units).reduce((s, n) => s + n, 0);
  return {
    portfolio: { properties, totalUnits, units, occupancyRate: totalUnits ? Number((((units.OCCUPIED ?? 0) * 100) / totalUnits).toFixed(1)) : 0, activeTenants, leasesExpiringIn60Days: expiring },
    rentThisMonth: thisMonth,
    overdueRecords: overdue,
    revenueTrend: trend.map((t) => ({ month: t.billingMonth.toISOString().slice(0, 7), expected: t._sum.total?.toFixed(2) ?? "0.00", collected: t._sum.paid?.toFixed(2) ?? "0.00" })),
    maintenance: count(maintenance, "status"),
    subscription: { status: entitlement.status, plan: entitlement.planCode, limits: entitlement.limits, usage: entitlement.usage },
    recentPayments,
  };
}
