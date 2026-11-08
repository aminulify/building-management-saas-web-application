import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { toCsv } from "@/lib/csv";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { moneyOrZero, pageArgs, pageResult, uuid, type pageQuery } from "@/lib/api/common";
import { ROLES } from "@/shared/roles";
import { PERMISSIONS } from "@/shared/permissions";

/* ---------- broadcasts (Super Admin notice to selected roles) ---------- */
export const broadcastSchema = z.object({
  audience: z.array(z.enum(ROLES)).min(1),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
});

export async function sendBroadcast(actor: Actor, input: z.infer<typeof broadcastSchema>, req: Request) {
  await authorize(actor, "broadcast:send");
  return db.$transaction(async (tx) => {
    const b = await tx.broadcast.create({ data: { createdById: actor.id, ...input } });
    const users = await tx.user.findMany({ where: { role: { in: input.audience }, status: "ACTIVE" }, select: { id: true } });
    await notify(users.map((u) => u.id), { type: "broadcast", titleKey: "notifications.broadcast", params: { title: input.title, body: input.body }, priority: "HIGH" }, tx);
    await tx.outboxEvent.create({ data: { type: "broadcast.sent", payload: { broadcastId: b.id } } });
    await writeAudit({ actor, action: "broadcast.send", resourceType: "Broadcast", resourceId: b.id, after: { audience: input.audience, recipients: users.length }, req }, tx);
    return { ...b, recipients: users.length };
  });
}

export const listBroadcasts = (actor: Actor) => authorize(actor, "broadcast:send").then(() => db.broadcast.findMany({ orderBy: { id: "desc" }, take: 50 }));

/* ---------- payments ---------- */
export const paymentsQuery = z.object({
  status: z.enum(["INITIATED", "PENDING_REVIEW", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  userId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const where = (q: z.infer<typeof paymentsQuery>): Prisma.PaymentTransactionWhereInput => ({
  status: q.status, userId: q.userId, ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
});

export async function listPayments(actor: Actor, q: z.infer<typeof paymentsQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "payment:refund");
  const rows = await db.paymentTransaction.findMany({
    where: where(q),
    include: { user: { select: { id: true, fullName: true, username: true } }, subscription: { select: { id: true, cycle: true, plan: { select: { code: true } } } }, invoice: { select: { number: true } } },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

export async function exportPayments(actor: Actor, q: z.infer<typeof paymentsQuery>, req: Request) {
  await authorize(actor, "payment:refund");
  const rows = await db.paymentTransaction.findMany({ where: where(q), include: { user: { select: { username: true } }, invoice: { select: { number: true } } }, orderBy: { id: "desc" }, take: 5000 });
  await writeAudit({ actor, action: "payments.export", resourceType: "PaymentTransaction", after: { rows: rows.length }, req });
  return toCsv(rows.map((r) => ({ id: r.id, date: r.createdAt, user: r.user.username, purpose: r.purpose, amount: r.amount.toFixed(2), gateway: r.gateway, reference: r.gatewayTxnId, status: r.status, refunded: r.refundAmount?.toFixed(2) ?? "", invoice: r.invoice?.number ?? "" })));
}

export const refundSchema = z.object({ amount: moneyOrZero.refine((v) => v > 0, "positive"), reason: z.string().trim().min(3).max(300) });

/** Refunds are manual bKash returns recorded by a Super Admin (architecture 9.4.8). A full refund cancels the subscription. */
export async function refund(actor: Actor, id: string, input: z.infer<typeof refundSchema>, req: Request) {
  await authorize(actor, "payment:refund");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentTransaction" WHERE id = ${id}::uuid FOR UPDATE`;
    const t = await tx.paymentTransaction.findUnique({ where: { id } });
    if (!t) throw new AppError("NOT_FOUND");
    if (t.status !== "SUCCESS") throw new AppError("INVALID_STATE", { from: t.status });
    const amount = new Prisma.Decimal(input.amount);
    const already = t.refundAmount ?? new Prisma.Decimal(0);
    if (already.plus(amount).gt(t.amount)) throw new AppError("VALIDATION_ERROR", [{ path: "amount", code: "exceeds_paid", max: t.amount.minus(already).toFixed(2) }]);
    const total = already.plus(amount);
    const full = total.gte(t.amount);
    const out = await tx.paymentTransaction.update({ where: { id }, data: { refundAmount: total, refundedAt: new Date(), refundReason: input.reason, status: full ? "REFUNDED" : "SUCCESS" } });
    if (full && t.subscriptionId) await tx.userSubscription.update({ where: { id: t.subscriptionId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await notify([t.userId], { type: "payment.refund", titleKey: "notifications.paymentRefund", params: { amount: amount.toFixed(2) }, priority: "HIGH" }, tx);
    await writeAudit({ actor, action: "payment.refund", resourceType: "PaymentTransaction", resourceId: id, before: { refunded: already.toFixed(2) }, after: { refunded: total.toFixed(2), reason: input.reason, full }, req }, tx);
    return out;
  });
}

/* ---------- Gov Admin permission overrides ---------- */
export const permissionsSchema = z.object({
  grant: z.array(z.enum(PERMISSIONS)).default([]),
  revoke: z.array(z.enum(PERMISSIONS)).default([]),
}).refine((v) => v.grant.every((g) => !v.revoke.includes(g)), { message: "grant_and_revoke_overlap" });

export async function setGovPermissions(actor: Actor, userId: string, input: z.infer<typeof permissionsSchema>, req: Request) {
  await authorize(actor, "govadmin:manage");
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) throw new AppError("NOT_FOUND");
  if (target.role !== "GOV_ADMIN") throw new AppError("INVALID_STATE", { reason: "gov_admin_only" });
  return db.$transaction(async (tx) => {
    for (const [list, granted] of [[input.grant, true], [input.revoke, false]] as const) {
      for (const permission of list) {
        await tx.userPermissionOverride.upsert({ where: { userId_permission: { userId, permission } }, update: { granted, grantedById: actor.id }, create: { userId, permission, granted, grantedById: actor.id } });
      }
    }
    await writeAudit({ actor, action: "user.permissions", resourceType: "User", resourceId: userId, after: { grant: input.grant, revoke: input.revoke }, req }, tx);
    return tx.userPermissionOverride.findMany({ where: { userId }, select: { permission: true, granted: true } });
  });
}

export const getGovPermissions = (actor: Actor, userId: string) =>
  authorize(actor, "govadmin:manage").then(() => db.userPermissionOverride.findMany({ where: { userId }, select: { permission: true, granted: true } }));
