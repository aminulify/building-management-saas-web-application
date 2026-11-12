import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { rateLimit } from "@/lib/rate-limit";
import { signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";

/**
 * Super Admin → Subscriptions & Packages. Every owner is counted once, by the newest plan they hold:
 *   Active        the plan runs and ends in more than EXPIRING_DAYS days
 *   Expiring soon the plan runs and ends within EXPIRING_DAYS days
 *   Expired       the plan has ended (in the grace period or over)
 */
export const EXPIRING_DAYS = 7;
export const PAGE_SIZE = 10;
const CYCLE_MONTHS = { MONTHLY: 1, QUARTERLY: 4, YEARLY: 12 } as const;

export type SubState = "ACTIVE" | "EXPIRING" | "EXPIRED";

/** The newest plan of each (live) owner, with the state worked out by the database clock. */
const latest = Prisma.sql`
  SELECT s.id, s."userId", s."planId", s.cycle, s.amount, s.status, s."startsAt", s."endsAt", s."createdAt", p.code AS "planCode",
    CASE WHEN s.status = 'ACTIVE' AND s."endsAt" > now() + (${EXPIRING_DAYS}::int * interval '1 day') THEN 'ACTIVE'
         WHEN s.status = 'ACTIVE' THEN 'EXPIRING' ELSE 'EXPIRED' END AS state
  FROM (
    SELECT DISTINCT ON (s0."userId") s0.* FROM "UserSubscription" s0
    JOIN "User" u ON u.id = s0."userId"
    WHERE s0.audience = 'OWNER' AND s0.status IN ('ACTIVE', 'GRACE', 'EXPIRED') AND u.role = 'OWNER' AND u."archivedAt" IS NULL AND u.status IN ('ACTIVE', 'SUSPENDED')
    ORDER BY s0."userId", s0."createdAt" DESC
  ) s JOIN "SubscriptionPlan" p ON p.id = s."planId"`;

/** Nine cards: who holds what, who must renew, boosts and money. */
export async function subscriptionStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [counts] = await db.$queryRaw<{ active: bigint; expiring: bigint; expired: bigint; primary: bigint; millionaire: bigint; billionaire: bigint; fresh: bigint }[]>`
    WITH l AS (${latest})
    SELECT count(*) FILTER (WHERE state IN ('ACTIVE', 'EXPIRING')) AS active,
           count(*) FILTER (WHERE state = 'EXPIRING') AS expiring,
           count(*) FILTER (WHERE state = 'EXPIRED') AS expired,
           count(*) FILTER (WHERE state IN ('ACTIVE', 'EXPIRING') AND "planCode" = 'PRIMARY') AS "primary",
           count(*) FILTER (WHERE state IN ('ACTIVE', 'EXPIRING') AND "planCode" = 'MILLIONAIRE') AS millionaire,
           count(*) FILTER (WHERE state IN ('ACTIVE', 'EXPIRING') AND "planCode" = 'BILLIONAIRE') AS billionaire,
           count(*) FILTER (WHERE COALESCE("startsAt", "createdAt") >= now() - interval '7 days') AS fresh
    FROM l`;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 6 * 3600_000);
  const [boostsActive, boostRevenue, subRevenue] = await Promise.all([
    db.listingBoost.count({ where: { deletedAt: null, status: "APPROVED", endsAt: { gt: new Date() } } }),
    db.paymentTransaction.aggregate({ where: { purpose: "PROMOTION", status: "SUCCESS" }, _sum: { amount: true }, _count: { _all: true } }),
    db.paymentTransaction.aggregate({ where: { purpose: "SUBSCRIPTION", status: "SUCCESS", verifiedAt: { gte: monthStart } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const n = (v: bigint | undefined) => Number(v ?? 0);
  return {
    active: n(counts?.active), newThisWeek: n(counts?.fresh), expiringDays: EXPIRING_DAYS,
    plans: { PRIMARY: n(counts?.primary), MILLIONAIRE: n(counts?.millionaire), BILLIONAIRE: n(counts?.billionaire) },
    expired: n(counts?.expired), expiring: n(counts?.expiring),
    boost: { active: boostsActive, paid: boostRevenue._count._all, revenue: (boostRevenue._sum.amount ?? 0).toString() },
    revenueMonth: { amount: (subRevenue._sum.amount ?? 0).toString(), payments: subRevenue._count._all },
  };
}

export const subListQuery = z.object({
  plan: z.enum(["all", "PRIMARY", "MILLIONAIRE", "BILLIONAIRE"]).default("all"),
  status: z.enum(["all", "ACTIVE", "EXPIRING", "EXPIRED"]).default("all"),
  /** an Owner ID such as OW10032, or part of a name or phone */
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

async function ownerIdsFor(q: string | undefined) {
  if (!q) return null;
  const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const people = await db.user.findMany({ where: { role: "OWNER", OR: [{ ownerCode: has(q) }, { fullName: has(q) }, { username: has(q) }, { phone: { contains: q } }] }, select: { id: true }, take: 500 });
  return people.map((p) => p.id);
}

const filters = (q: { plan: string; status: string }, ids: string[] | null) => Prisma.sql`
  WHERE (${q.plan} = 'all' OR "planCode" = ${q.plan}) AND (${q.status} = 'all' OR state = ${q.status})
  ${ids ? Prisma.sql`AND "userId" = ANY(${ids}::uuid[])` : Prisma.empty}`;

export async function subscriptionList(actor: Actor, q: z.infer<typeof subListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const ids = await ownerIdsFor(q.q);
  const where = filters(q, ids);
  const [rows, count] = await Promise.all([
    db.$queryRaw<{ id: string; userId: string; planId: string; cycle: keyof typeof CYCLE_MONTHS; amount: Prisma.Decimal; status: string; startsAt: Date | null; endsAt: Date | null; createdAt: Date; planCode: string; state: SubState }[]>`
      WITH l AS (${latest}) SELECT * FROM l ${where} ORDER BY "createdAt" DESC, id DESC LIMIT ${PAGE_SIZE} OFFSET ${(q.page - 1) * PAGE_SIZE}`,
    db.$queryRaw<{ n: bigint }[]>`WITH l AS (${latest}) SELECT count(*) AS n FROM l ${where}`,
  ]);
  const userIds = rows.map((r) => r.userId);
  const [users, plans, props, units, paid] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, ownerCode: true, phone: true, email: true, avatarKey: true } }),
    db.subscriptionPlan.findMany({ where: { id: { in: rows.map((r) => r.planId) } }, select: { id: true, nameEn: true, nameBn: true, propertyLimit: true, unitLimit: true } }),
    db.property.groupBy({ by: ["ownerId"], where: { ownerId: { in: userIds }, archivedAt: null }, _count: { _all: true } }),
    db.unit.findMany({ where: { property: { ownerId: { in: userIds }, archivedAt: null }, archivedAt: null }, select: { property: { select: { ownerId: true } } } }),
    db.paymentTransaction.findMany({ where: { subscriptionId: { in: rows.map((r) => r.id) }, status: "SUCCESS" }, select: { subscriptionId: true } }),
  ]);
  const avatars = await signStorageKeys(users.flatMap((u) => (u.avatarKey ? [u.avatarKey] : [])), 3600);
  const U = new Map(users.map((u) => [u.id, u])), P = new Map(plans.map((p) => [p.id, p]));
  const propCount = new Map(props.map((x) => [x.ownerId, x._count._all]));
  const unitCount = new Map<string, number>();
  for (const u of units) unitCount.set(u.property.ownerId, (unitCount.get(u.property.ownerId) ?? 0) + 1);
  const paidIds = new Set(paid.map((x) => x.subscriptionId));
  const items = rows.map((r) => {
    const u = U.get(r.userId), p = P.get(r.planId);
    return {
      id: r.id, userId: r.userId, state: r.state, status: r.status, cycle: r.cycle, months: CYCLE_MONTHS[r.cycle], paid: paidIds.has(r.id), amount: r.amount.toString(), startsAt: r.startsAt, endsAt: r.endsAt,
      daysLeft: r.endsAt ? Math.ceil((r.endsAt.getTime() - Date.now()) / 86_400_000) : null,
      owner: { fullName: u?.fullName ?? "", ownerCode: u?.ownerCode ?? null, phone: u?.phone ?? null, email: u?.email ?? null, avatarUrl: u?.avatarKey ? avatars.get(u.avatarKey) ?? null : null },
      plan: { code: r.planCode, nameEn: p?.nameEn ?? r.planCode, nameBn: p?.nameBn ?? r.planCode },
      usage: { properties: propCount.get(r.userId) ?? 0, units: unitCount.get(r.userId) ?? 0, propertyLimit: p?.propertyLimit ?? 0, unitLimit: p?.unitLimit ?? 0 },
    };
  });
  return { items, total: Number(count[0]?.n ?? 0), page: q.page, pageSize: PAGE_SIZE };
}

/** One owner's plan in full: dates, limits against usage, boosts and the payment history. */
export async function subscriptionDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const rows = await db.$queryRaw<{ id: string; userId: string; state: SubState }[]>`WITH l AS (${latest}) SELECT id, "userId", state FROM l WHERE id = ${id}::uuid`;
  const hit = rows[0];
  if (!hit) throw new AppError("NOT_FOUND");
  const s = await db.userSubscription.findUniqueOrThrow({ where: { id }, include: { plan: { select: { code: true, nameEn: true, nameBn: true, monthlyPrice: true, propertyLimit: true, unitLimit: true, listingLimit: true } } } });
  const [owner, props, units, listings, txns, boosts] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: hit.userId }, select: { fullName: true, ownerCode: true, phone: true, email: true, avatarKey: true, createdAt: true } }),
    db.property.count({ where: { ownerId: hit.userId, archivedAt: null } }),
    db.unit.count({ where: { property: { ownerId: hit.userId }, archivedAt: null } }),
    db.listing.count({ where: { sellerId: hit.userId, status: { in: ["PENDING", "PUBLISHED"] } } }),
    db.paymentTransaction.findMany({ where: { userId: hit.userId, purpose: "SUBSCRIPTION" }, orderBy: { id: "desc" }, take: 12, select: { id: true, gatewayTxnId: true, amount: true, status: true, createdAt: true, verifiedAt: true, invoice: { select: { number: true } } } }),
    db.listingBoost.count({ where: { userId: hit.userId, deletedAt: null, status: "APPROVED" } }),
  ]);
  const avatarUrl = owner.avatarKey ? (await signStorageKeys([owner.avatarKey], 3600)).get(owner.avatarKey) ?? null : null;
  const { plan, ...sub } = s;
  return {
    id: s.id, userId: hit.userId, state: hit.state, status: sub.status, cycle: sub.cycle, months: CYCLE_MONTHS[sub.cycle], amount: sub.amount.toString(), startsAt: sub.startsAt, endsAt: sub.endsAt, graceEndsAt: sub.graceEndsAt, autoRenew: sub.autoRenew,
    daysLeft: sub.endsAt ? Math.ceil((sub.endsAt.getTime() - Date.now()) / 86_400_000) : null,
    owner: { fullName: owner.fullName, ownerCode: owner.ownerCode, phone: owner.phone, email: owner.email, avatarUrl, memberSince: owner.createdAt },
    plan: { code: plan.code, nameEn: plan.nameEn, nameBn: plan.nameBn, monthlyPrice: plan.monthlyPrice.toString() },
    usage: { properties: props, units, listings, propertyLimit: plan.propertyLimit, unitLimit: plan.unitLimit, listingLimit: plan.listingLimit },
    boosts, payments: txns.map((t) => ({ id: t.id, trxId: t.gatewayTxnId, amount: t.amount.toString(), status: t.status, createdAt: t.createdAt, verifiedAt: t.verifiedAt, invoice: t.invoice?.number ?? null })),
  };
}

/* ---------- bulk reminders ---------- */
export const reminderAudience = z.enum(["expiring", "expired", "all"]);

const fill = (tpl: string, v: { name: string; plan: string; amount: string; date: string }) =>
  tpl.replaceAll("[name]", v.name).replaceAll("[plan]", v.plan).replaceAll("[amount]", v.amount).replaceAll("[date]", v.date);

/** Who a reminder goes to: Expiring Soon owners, Expired owners, or every owner (even with no plan). */
async function recipients(audience: z.infer<typeof reminderAudience>) {
  if (audience === "all") {
    const owners = await db.user.findMany({ where: { role: "OWNER", archivedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true } });
    const subs = await db.$queryRaw<{ userId: string; amount: Prisma.Decimal; endsAt: Date | null; planCode: string }[]>`WITH l AS (${latest}) SELECT "userId", amount, "endsAt", "planCode" FROM l`;
    const by = new Map(subs.map((s) => [s.userId, s]));
    return owners.map((o) => ({ id: o.id, name: o.fullName, amount: by.get(o.id)?.amount ?? new Prisma.Decimal(0), endsAt: by.get(o.id)?.endsAt ?? null, planCode: by.get(o.id)?.planCode ?? "" }));
  }
  const state = audience === "expiring" ? "EXPIRING" : "EXPIRED";
  const rows = await db.$queryRaw<{ userId: string; amount: Prisma.Decimal; endsAt: Date | null; planCode: string }[]>`WITH l AS (${latest}) SELECT "userId", amount, "endsAt", "planCode" FROM l WHERE state = ${state}`;
  const people = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) }, status: "ACTIVE" }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
  return rows.filter((r) => people.has(r.userId)).map((r) => ({ id: r.userId, name: people.get(r.userId)!, amount: r.amount, endsAt: r.endsAt, planCode: r.planCode }));
}

/** Preview for the banners and the composer: how many owners and how much is due. */
export async function reminderPreview(actor: Actor, audience: z.infer<typeof reminderAudience>) {
  requireRole(actor, "SUPER_ADMIN");
  const r = await recipients(audience);
  return { audience, count: r.length, totalDue: audience === "all" ? "0" : r.reduce((a, x) => a.plus(x.amount), new Prisma.Decimal(0)).toString(), sample: r.slice(0, 5).map((x) => x.name), expiringDays: EXPIRING_DAYS };
}

/** The composer: [name], [plan], [amount] and [date] are filled in for each owner. */
export const reminderSchema = z.object({
  audience: reminderAudience,
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(1500),
}).strict();

export async function sendReminder(actor: Actor, input: z.infer<typeof reminderSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  rateLimit(`sub-reminder:${actor.id}:${input.audience}`, 5, 3600_000);
  const list = await recipients(input.audience);
  if (list.length === 0) throw new AppError("INVALID_STATE", { reason: "no_recipients" });
  const names = new Map((await db.subscriptionPlan.findMany({ select: { code: true, nameEn: true } })).map((p) => [p.code, p.nameEn]));
  const date = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(d) : "-");
  return db.$transaction(async (tx) => {
    const b = await tx.broadcast.create({ data: { createdById: actor.id, audience: ["OWNER"], title: input.title, body: input.body } });
    const rows = list.map((r) => {
      const v = { name: r.name, plan: names.get(r.planCode) ?? "", amount: r.amount.toString(), date: date(r.endsAt) };
      const title = fill(input.title, v), body = fill(input.body, v);
      return { userId: r.id, type: "broadcast", titleKey: "notifications.broadcast", link: "/home-owner/subscription", priority: "HIGH" as const, params: { title, body } };
    });
    await tx.notification.createMany({ data: rows });
    await tx.outboxEvent.create({ data: { type: "broadcast.sent", payload: { broadcastId: b.id } } });
    await writeAudit({ actor, action: "subscription.reminder", resourceType: "Broadcast", resourceId: b.id, after: { audience: input.audience, recipients: list.length }, req }, tx);
    return { id: b.id, recipients: list.length };
  });
}
