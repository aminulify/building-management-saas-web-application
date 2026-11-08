import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/authz/authorize";
import { toCsv } from "@/lib/csv";
import type { Actor } from "@/lib/auth/require-actor";

export const rangeQuery = z
  .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "invalid_range", path: ["to"] });

const range = (q: z.infer<typeof rangeQuery>) => ({
  from: q.from ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)),
  to: q.to ?? new Date(),
});

type Row = { m: Date; n: bigint | number; s?: Prisma.Decimal | number | null };
const series = (rows: Row[]) => rows.map((r) => ({ month: r.m.toISOString().slice(0, 7), count: Number(r.n), ...(r.s !== undefined ? { amount: Number(r.s ?? 0).toFixed(2) } : {}) }));

/** Platform analytics (7.13). Every figure is aggregated from stored records for the selected date range. */
export async function platformAnalytics(actor: Actor, q: z.infer<typeof rangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const { from, to } = range(q);
  const [users, properties, revenue, plans, rent, sosByType, sosTimes, listings] = await Promise.all([
    db.$queryRaw<Row[]>`SELECT date_trunc('month', "createdAt") AS m, count(*) AS n FROM "User" WHERE "createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Row[]>`SELECT date_trunc('month', "createdAt") AS m, count(*) AS n FROM "Property" WHERE "createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Row[]>`SELECT date_trunc('month', "verifiedAt") AS m, count(*) AS n, sum(amount) AS s FROM "PaymentTransaction" WHERE status = 'SUCCESS' AND "verifiedAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    db.userSubscription.groupBy({ by: ["planId"], where: { status: { in: ["ACTIVE", "GRACE"] } }, _count: { _all: true } }),
    db.$queryRaw<{ m: Date; expected: Prisma.Decimal; collected: Prisma.Decimal }[]>`SELECT "billingMonth" AS m, sum(total) AS expected, sum(paid) AS collected FROM "RentRecord" WHERE "billingMonth" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    db.emergencyAlert.groupBy({ by: ["type"], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    db.emergencyAlert.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, acknowledgedAt: true, resolvedAt: true } }),
    marketplaceAnalytics(actor, q),
  ]);
  const planRows = await db.subscriptionPlan.findMany({ select: { id: true, code: true } });
  const code = new Map(planRows.map((p) => [p.id, p.code]));
  const avg = (f: (r: (typeof sosTimes)[number]) => Date | null) => {
    const v = sosTimes.map((r) => f(r) && (f(r)!.getTime() - r.createdAt.getTime()) / 60000).filter((x): x is number => typeof x === "number");
    return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)) : null;
  };
  return {
    range: { from, to },
    userGrowth: series(users), propertyGrowth: series(properties), revenue: series(revenue),
    subscriptionDistribution: Object.fromEntries(plans.map((p) => [code.get(p.planId) ?? p.planId, p._count._all])),
    rentActivity: rent.map((r) => ({ month: r.m.toISOString().slice(0, 7), expected: r.expected.toFixed(2), collected: r.collected.toFixed(2) })),
    emergency: { byType: Object.fromEntries(sosByType.map((s) => [s.type, s._count._all])), avgMinutesToAcknowledge: avg((r) => r.acknowledgedAt), avgMinutesToResolve: avg((r) => r.resolvedAt) },
    marketplace: listings,
  };
}

/** Marketplace analytics (3.10): totals, revenue from Seller Plans, distributions, popular zones, report statistics. */
export async function marketplaceAnalytics(actor: Actor, q: z.infer<typeof rangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const { from, to } = range(q);
  const inRange = { createdAt: { gte: from, lte: to } };
  const [byStatus, byType, byCategory, zones, sellers, reports, revenue] = await Promise.all([
    db.listing.groupBy({ by: ["status"], where: inRange, _count: { _all: true } }),
    db.listing.groupBy({ by: ["type"], where: inRange, _count: { _all: true } }),
    db.listing.groupBy({ by: ["category"], where: inRange, _count: { _all: true } }),
    db.$queryRaw<{ zone: string; n: bigint }[]>`SELECT z."nameEn" AS zone, count(*) AS n FROM "Listing" l JOIN "Zone" z ON z.id = l."zoneId" WHERE l."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    db.$queryRaw<{ role: string; n: bigint }[]>`SELECT u.role::text AS role, count(*) AS n FROM "Listing" l JOIN "User" u ON u.id = l."sellerId" WHERE l."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1`,
    db.listingReport.groupBy({ by: ["status", "category"], where: inRange, _count: { _all: true } }),
    db.paymentTransaction.aggregate({ where: { status: "SUCCESS", verifiedAt: { gte: from, lte: to }, subscription: { audience: "SELLER" } }, _sum: { amount: true } }),
  ]);
  const c = (k: string) => byStatus.find((s) => s.status === k)?._count._all ?? 0;
  return {
    totalListings: byStatus.reduce((s, r) => s + r._count._all, 0),
    activeListings: c("PUBLISHED"), soldListings: c("SOLD"), rentalListings: byType.find((t) => t.type === "RENT")?._count._all ?? 0,
    listingRevenue: (revenue._sum.amount ?? 0).toString(),
    sellerDistribution: Object.fromEntries(sellers.map((s) => [s.role, Number(s.n)])),
    popularZones: zones.map((z) => ({ zone: z.zone, listings: Number(z.n) })),
    categoryDistribution: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
    reportStatistics: reports.map((r) => ({ status: r.status, category: r.category, count: r._count._all })),
  };
}

export async function analyticsCsv(actor: Actor, q: z.infer<typeof rangeQuery>) {
  const a = await platformAnalytics(actor, q);
  const rows = [
    ...a.userGrowth.map((r) => ({ metric: "users", month: r.month, value: r.count })),
    ...a.propertyGrowth.map((r) => ({ metric: "properties", month: r.month, value: r.count })),
    ...a.revenue.map((r) => ({ metric: "revenue_bdt", month: r.month, value: r.amount })),
    ...a.rentActivity.map((r) => ({ metric: "rent_collected_bdt", month: r.month, value: r.collected })),
  ];
  if (rows.length === 0) throw new AppError("NOT_FOUND", { reason: "no_data_in_range" });
  return toCsv(rows);
}

/** Marketplace dashboard counters (3.1): public, only PUBLISHED listings. */
export async function marketplaceStats() {
  const where = { status: "PUBLISHED" as const };
  const [total, rent, sale, byCat, featured, recent, zones] = await Promise.all([
    db.listing.count({ where }), db.listing.count({ where: { ...where, type: "RENT" } }), db.listing.count({ where: { ...where, type: "SALE" } }),
    db.listing.groupBy({ by: ["category"], where, _count: { _all: true } }),
    db.listing.findMany({ where: { ...where, isFeatured: true }, orderBy: { id: "desc" }, take: 6, select: { id: true, title: true, price: true, type: true, category: true, images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } } } }),
    db.listing.findMany({ where, orderBy: { id: "desc" }, take: 6, select: { id: true, title: true, price: true, type: true, category: true, images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } } } }),
    db.$queryRaw<{ id: string; nameEn: string; nameBn: string; n: bigint }[]>`SELECT z.id, z."nameEn", z."nameBn", count(*) AS n FROM "Listing" l JOIN "Zone" z ON z.id = l."zoneId" WHERE l.status = 'PUBLISHED' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 8`,
  ]);
  const cat = (k: string) => byCat.find((c) => c.category === k)?._count._all ?? 0;
  return { totalProperties: total, availableForRent: rent, availableForSale: sale, apartments: cat("APARTMENT"), flats: cat("FLAT"), land: cat("LAND"), featured, recent, popularZones: zones.map((z) => ({ id: z.id, nameEn: z.nameEn, nameBn: z.nameBn, listings: Number(z.n) })) };
}
