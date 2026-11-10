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

/** Extra headline numbers for the owner dashboard cards (all scoped to the caller's own records). */
export async function ownerStats(actor: Actor) {
  requireRole(actor, "OWNER");
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400_000);
  const [unpaid, maintenance] = await Promise.all([
    // units with rent that fell due in the last 30 days and is still not fully paid
    db.rentRecord.findMany({
      where: { agreement: { ownerId: actor.id }, status: { in: ["DUE", "PARTIAL", "OVERDUE"] }, dueDate: { gte: since, lte: now } },
      select: { agreement: { select: { unitId: true } } },
    }),
    db.maintenanceRequest.groupBy({ by: ["status"], where: { agreement: { ownerId: actor.id } }, _count: { _all: true } }),
  ]);
  const m = count(maintenance, "status");
  const total = Object.entries(m).filter(([k]) => k !== "CANCELLED" && k !== "REJECTED").reduce((s, [, n]) => s + n, 0);
  const solved = m.COMPLETED ?? 0;
  return {
    unpaidUnitsLast30Days: new Set(unpaid.map((r) => r.agreement.unitId)).size,
    maintenance: { total, solved, solvedRate: total ? Number(((solved * 100) / total).toFixed(1)) : 0 },
  };
}

/** Month-by-month expected vs collected rent for one year (Jan–Dec), plus the years the owner has data for. */
export async function ownerRevenue(actor: Actor, year: number) {
  requireRole(actor, "OWNER");
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [rows, first] = await Promise.all([
    db.rentRecord.groupBy({ by: ["billingMonth"], where: { agreement: { ownerId: actor.id }, billingMonth: { gte: from, lt: to } }, _sum: { total: true, paid: true } }),
    db.rentalAgreement.findFirst({ where: { ownerId: actor.id }, orderBy: { startDate: "asc" }, select: { startDate: true } }),
  ]);
  const byMonth = new Map(rows.map((r) => [r.billingMonth.getUTCMonth(), r._sum]));
  const thisYear = new Date().getUTCFullYear();
  const firstYear = Math.min(first?.startDate.getUTCFullYear() ?? thisYear, thisYear);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    expected: byMonth.get(i)?.total?.toFixed(2) ?? "0.00",
    collected: byMonth.get(i)?.paid?.toFixed(2) ?? "0.00",
  }));
  const sum = (k: "expected" | "collected") => months.reduce((s, m) => s + Number(m[k]), 0).toFixed(2);
  return { year, months, totals: { expected: sum("expected"), collected: sum("collected") }, years: Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i) };
}

export type OwnerActivityKind = "TENANT_ADDED" | "RENT_PAID" | "MAINTENANCE_REQUESTED" | "ALERT_SENT" | "REMINDERS_SENT";

/** Newest-first feed built from real records: new tenants, verified rent payments, maintenance requests, and the owner's own alerts. */
export async function ownerActivities(actor: Actor, limit: number) {
  requireRole(actor, "OWNER");
  const [agreements, payments, requests, alerts, reminders] = await Promise.all([
    db.rentalAgreement.findMany({ where: { ownerId: actor.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, createdAt: true, unit: { select: { unitNumber: true } } } }),
    db.rentPayment.findMany({ where: { status: "VERIFIED", rentRecord: { agreement: { ownerId: actor.id } } }, orderBy: { paidAt: "desc" }, take: limit, select: { id: true, paidAt: true, amount: true, rentRecord: { select: { agreement: { select: { unit: { select: { unitNumber: true } } } } } } } }),
    db.maintenanceRequest.findMany({ where: { agreement: { ownerId: actor.id } }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, createdAt: true, title: true, unit: { select: { unitNumber: true } } } }),
    db.emergencyAlert.findMany({ where: { reporterId: actor.id }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, createdAt: true, type: true } }),
    db.auditLog.findMany({ where: { actorId: actor.id, action: "rent.remind_all" }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, createdAt: true, after: true } }),
  ]);
  const items = [
    ...agreements.map((a) => ({ id: `a-${a.id}`, kind: "TENANT_ADDED" as OwnerActivityKind, at: a.createdAt, unit: a.unit.unitNumber, amount: null as string | null, text: null as string | null })),
    ...payments.map((p) => ({ id: `p-${p.id}`, kind: "RENT_PAID" as OwnerActivityKind, at: p.paidAt, unit: p.rentRecord.agreement.unit.unitNumber, amount: p.amount.toFixed(2), text: null })),
    ...requests.map((r) => ({ id: `m-${r.id}`, kind: "MAINTENANCE_REQUESTED" as OwnerActivityKind, at: r.createdAt, unit: r.unit.unitNumber, amount: null, text: r.title })),
    ...reminders.map((a) => ({ id: `r-${a.id}`, kind: "REMINDERS_SENT" as OwnerActivityKind, at: a.createdAt, unit: null as string | null, amount: null as string | null, text: String((a.after as { sent?: number } | null)?.sent ?? 0) })),
    ...alerts.map((a) => ({ id: `s-${a.id}`, kind: "ALERT_SENT" as OwnerActivityKind, at: a.createdAt, unit: null as string | null, amount: null, text: a.type })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}
