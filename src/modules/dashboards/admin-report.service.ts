import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import { pageArgs, pageResult, uuid } from "@/lib/api/common";
import type { Actor } from "@/lib/auth/require-actor";
import { adminRangeQuery, dhakaToday, resolveRange } from "./admin-range";

/** Business Analysis Report (Super Admin): money comes from verified payments only (status SUCCESS, by the day they were verified, Dhaka time). */

const sum = (v: Prisma.Decimal | null) => (v ?? 0).toString();

/** The page opens on the last 30 days (today and the 29 days before it). */
const reportRange = (q: z.infer<typeof adminRangeQuery>) => {
  const to = q.to ?? dhakaToday();
  return resolveRange({ from: q.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10), to });
};

/** Paid subscribers (people who paid for a plan), subscription money, boost money and their total, for the chosen dates. */
export async function reportSummary(actor: Actor, q: z.infer<typeof adminRangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const r = reportRange(q);
  const where = (purpose: "SUBSCRIPTION" | "PROMOTION") => ({ status: "SUCCESS" as const, purpose, verifiedAt: { gte: r.start, lte: r.end } });
  const [subs, boost, payers] = await Promise.all([
    db.paymentTransaction.aggregate({ where: where("SUBSCRIPTION"), _sum: { amount: true }, _count: { _all: true } }),
    db.paymentTransaction.aggregate({ where: where("PROMOTION"), _sum: { amount: true }, _count: { _all: true } }),
    db.paymentTransaction.groupBy({ by: ["userId"], where: where("SUBSCRIPTION") }),
  ]);
  const subscriptionTotal = Number(subs._sum.amount ?? 0), boostTotal = Number(boost._sum.amount ?? 0);
  return {
    range: { from: r.from, to: r.to },
    paidSubscribers: payers.length,
    subscription: { amount: sum(subs._sum.amount), payments: subs._count._all },
    boost: { amount: sum(boost._sum.amount), payments: boost._count._all },
    totalPaid: (subscriptionTotal + boostTotal).toString(),
  };
}

export const revenueQuery = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() });

/** Twelve months (Jan–Dec) of one year: subscription money and boost money per month, plus the years that have any payment. */
export async function reportRevenue(actor: Actor, q: z.infer<typeof revenueQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const thisYear = Number(dhakaToday().slice(0, 4));
  const year = q.year ?? thisYear;
  const [rows, first] = await Promise.all([
    db.$queryRaw<{ m: number; purpose: string; total: string }[]>`
      SELECT EXTRACT(MONTH FROM ("verifiedAt" AT TIME ZONE 'Asia/Dhaka'))::int AS m, purpose::text AS purpose, SUM(amount)::text AS total
      FROM "PaymentTransaction"
      WHERE status = 'SUCCESS' AND purpose IN ('SUBSCRIPTION', 'PROMOTION') AND "verifiedAt" IS NOT NULL
        AND EXTRACT(YEAR FROM ("verifiedAt" AT TIME ZONE 'Asia/Dhaka'))::int = ${year}
      GROUP BY 1, 2`,
    db.paymentTransaction.findFirst({ where: { status: "SUCCESS", purpose: { in: ["SUBSCRIPTION", "PROMOTION"] }, verifiedAt: { not: null } }, orderBy: { verifiedAt: "asc" }, select: { verifiedAt: true } }),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, subscription: 0, boost: 0 }));
  for (const r of rows) { const m = months[r.m - 1]; if (m) m[r.purpose === "PROMOTION" ? "boost" : "subscription"] = Number(r.total); }
  const firstYear = first?.verifiedAt ? Number(new Date(first.verifiedAt.getTime() + 6 * 3600_000).toISOString().slice(0, 4)) : thisYear;
  const years = Array.from({ length: Math.max(0, thisYear - Math.min(firstYear, thisYear)) + 1 }, (_, i) => thisYear - i);
  if (!years.includes(year)) years.push(year);
  return {
    year, years: years.sort((a, b) => b - a), months,
    totals: { subscription: months.reduce((a, m) => a + m.subscription, 0), boost: months.reduce((a, m) => a + m.boost, 0) },
  };
}

/** How many owners hold each plan right now (Active or in grace) AND paid for it (a verified payment exists), for every plan on offer. A plan given without a payment (demo or seed accounts) is not counted. */
export async function reportPlans(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [plans, counts, boosts] = await Promise.all([
    db.subscriptionPlan.findMany({ where: { audience: "OWNER", isActive: true }, orderBy: { monthlyPrice: "asc" }, select: { id: true, code: true, nameEn: true, nameBn: true } }),
    db.userSubscription.groupBy({ by: ["planId"], where: { audience: "OWNER", status: { in: ["ACTIVE", "GRACE"] }, transactions: { some: { status: "SUCCESS" } }, user: { archivedAt: null, status: { not: "DELETED" } } }, _count: { _all: true } }),
    db.paymentTransaction.count({ where: { purpose: "PROMOTION", status: "SUCCESS" } }),
  ]);
  const byPlan = new Map(counts.map((c) => [c.planId, c._count._all]));
  const items = plans.map((p) => ({ code: p.code, nameEn: p.nameEn, nameBn: p.nameBn, subscribers: byPlan.get(p.id) ?? 0 }));
  return { items, boost: boosts, total: items.reduce((a, p) => a + p.subscribers, 0) + boosts };
}

export const transactionsQuery = z.object({
  status: z.enum(["all", "active", "failed"]).default("all"),
  /** "all", "boost", or a plan code such as PRIMARY */
  plan: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,40}$/).default("ALL"),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

/** Money in and out, newest first: plan payments and boost payments. Active = verified (SUCCESS), Failed = refused or cancelled (FAILED). */
export async function reportTransactions(actor: Actor, q: z.infer<typeof transactionsQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const where: Prisma.PaymentTransactionWhereInput = {
    purpose: { in: ["SUBSCRIPTION", "PROMOTION"] },
    ...(q.status === "active" ? { status: "SUCCESS" } : q.status === "failed" ? { status: "FAILED" } : {}),
  };
  if (q.plan === "BOOST") where.purpose = "PROMOTION";
  else if (q.plan !== "ALL") { where.purpose = "SUBSCRIPTION"; where.OR = [{ subscription: { plan: { code: q.plan } } }, { upgradeRequest: { plan: { code: q.plan } } }]; }
  const [rows, total] = await Promise.all([
    db.paymentTransaction.findMany({
      where, ...pageArgs(q),
      select: {
        id: true, gatewayTxnId: true, purpose: true, amount: true, status: true, createdAt: true, verifiedAt: true,
        user: { select: { fullName: true, username: true, role: true } },
        subscription: { select: { plan: { select: { code: true, nameEn: true, nameBn: true } } } },
        upgradeRequest: { select: { plan: { select: { code: true, nameEn: true, nameBn: true } } } },
      },
    }),
    db.paymentTransaction.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const items = page.items.map(({ subscription, upgradeRequest, amount, user, ...t }) => ({
    ...t, amount: amount.toString(), owner: { fullName: user.fullName, username: user.username, role: user.role },
    plan: t.purpose === "PROMOTION" ? null : (subscription?.plan ?? upgradeRequest?.plan ?? null),
  }));
  return { items, nextCursor: page.nextCursor, total };
}

/**
 * What the invoice of the chosen dates says: verified money per plan (Primary, Millionaire, Billionaire, any other plan on offer) and for Boosts, with a grand total.
 * Plan money is credited to the plan that was bought (the subscription, or the upgrade request that was approved).
 */
export async function reportBreakdown(actor: Actor, q: z.infer<typeof adminRangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const r = reportRange(q);
  const [plans, rows, boost] = await Promise.all([
    db.subscriptionPlan.findMany({ where: { audience: "OWNER", isActive: true }, orderBy: { monthlyPrice: "asc" }, select: { code: true, nameEn: true, nameBn: true } }),
    db.$queryRaw<{ code: string | null; n: bigint; total: string }[]>`
      SELECT COALESCE(sp.code, up.code) AS code, count(*) AS n, COALESCE(SUM(t.amount), 0)::text AS total
      FROM "PaymentTransaction" t
      LEFT JOIN "UserSubscription" s ON s.id = t."subscriptionId" LEFT JOIN "SubscriptionPlan" sp ON sp.id = s."planId"
      LEFT JOIN "UpgradeRequest" u ON u.id = t."upgradeRequestId" LEFT JOIN "SubscriptionPlan" up ON up.id = u."planId"
      WHERE t.status = 'SUCCESS' AND t.purpose = 'SUBSCRIPTION' AND t."verifiedAt" >= ${r.start} AND t."verifiedAt" <= ${r.end}
      GROUP BY 1`,
    db.paymentTransaction.aggregate({ where: { status: "SUCCESS", purpose: "PROMOTION", verifiedAt: { gte: r.start, lte: r.end } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const by = new Map(rows.map((x) => [x.code ?? "", x]));
  const lines = plans.map((p) => ({ code: p.code, nameEn: p.nameEn, nameBn: p.nameBn, sold: Number(by.get(p.code)?.n ?? 0), amount: by.get(p.code)?.total ?? "0" }));
  const other = rows.filter((x) => !plans.some((p) => p.code === x.code)); // money for a plan that is no longer on offer still counts
  if (other.length) lines.push({ code: "OTHER", nameEn: "Other plans", nameBn: "অন্যান্য প্ল্যান", sold: other.reduce((a, x) => a + Number(x.n), 0), amount: other.reduce((a, x) => a + Number(x.total), 0).toString() });
  const boostLine = { sold: boost._count._all, amount: sum(boost._sum.amount) };
  const total = lines.reduce((a, l) => a + Number(l.amount), 0) + Number(boostLine.amount);
  return { range: { from: r.from, to: r.to }, generatedAt: new Date().toISOString(), plans: lines, boost: boostLine, totalSold: lines.reduce((a, l) => a + l.sold, 0) + boostLine.sold, total: total.toString() };
}
