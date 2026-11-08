import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { planUpdateSchema } from "./schema";

/** Cancel: access continues until endsAt, then the subscription expires without a grace period (architecture 9.4.8). */
export async function cancelSubscription(actor: Actor, id: string, req: Request) {
  const s = await db.userSubscription.findUnique({ where: { id } });
  if (!s || s.userId !== actor.id) throw new AppError("NOT_FOUND");
  if (s.status !== "ACTIVE" && s.status !== "GRACE") throw new AppError("INVALID_STATE", { from: s.status });
  if (s.cancelledAt) return s;
  return db.$transaction(async (tx) => {
    const out = await tx.userSubscription.update({ where: { id }, data: { cancelledAt: new Date(), autoRenew: false } });
    await notify([actor.id], { type: "subscription.cancelled", titleKey: "notifications.subscriptionCancelled", params: { endsAt: s.endsAt?.toISOString() ?? "" } }, tx);
    await writeAudit({ actor, action: "subscription.cancel", resourceType: "UserSubscription", resourceId: id, req }, tx);
    return out;
  });
}

/** Invoice data for the PDF renderer and the invoice page. Owner of the payment or Super Admin only. */
export async function getInvoice(actor: Actor, id: string) {
  const inv = await db.invoice.findUnique({
    where: { id },
    include: { transaction: { include: { user: { select: { id: true, fullName: true, username: true, ownerCode: true, phone: true, email: true } }, subscription: { select: { cycle: true, startsAt: true, endsAt: true, planSnapshot: true } } } } },
  });
  if (!inv) throw new AppError("NOT_FOUND");
  if (inv.transaction.userId !== actor.id && actor.role !== "SUPER_ADMIN") throw new AppError("NOT_FOUND");
  const t = inv.transaction;
  const snap = (t.subscription?.planSnapshot ?? {}) as { code?: string; nameEn?: string; nameBn?: string };
  return {
    number: inv.number, issuedAt: inv.createdAt, currency: "BDT",
    customer: t.user, plan: { code: snap.code, nameEn: snap.nameEn, nameBn: snap.nameBn },
    cycle: t.subscription?.cycle, periodStart: t.subscription?.startsAt, periodEnd: t.subscription?.endsAt,
    amount: t.amount.toFixed(2), refunded: t.refundAmount?.toFixed(2) ?? "0.00",
    payment: { gateway: t.gateway, reference: t.gatewayTxnId, verifiedAt: t.verifiedAt },
  };
}

/* ---------- Super Admin plan extras ---------- */
export async function deletePlan(actor: Actor, id: string, req: Request) {
  await authorize(actor, "plan:manage");
  const used = (await db.userSubscription.count({ where: { planId: id } })) + (await db.upgradeRequest.count({ where: { planId: id } }));
  if (used > 0) throw new AppError("INVALID_STATE", { reason: "plan_in_use_deactivate_instead" });
  return db.$transaction(async (tx) => {
    const p = await tx.subscriptionPlan.findUnique({ where: { id } });
    if (!p) throw new AppError("NOT_FOUND");
    await tx.planPriceHistory.deleteMany({ where: { planId: id } });
    await tx.scheduledPlanChange.deleteMany({ where: { planId: id } });
    await tx.subscriptionPlan.delete({ where: { id } });
    await writeAudit({ actor, action: "plan.delete", resourceType: "SubscriptionPlan", resourceId: id, before: { code: p.code }, req }, tx);
    return { deleted: true };
  });
}

export const scheduleSchema = z.object({
  changes: planUpdateSchema,
  effectiveAt: z.coerce.date().refine((d) => d.getTime() > Date.now() + 60_000, "must_be_future"),
});

/** "Schedule Change": applied by the daily job at effectiveAt. Existing subscriptions keep their snapshot until renewal. */
export async function schedulePlanChange(actor: Actor, id: string, input: z.infer<typeof scheduleSchema>, req: Request) {
  await authorize(actor, "pricing:manage");
  if (!(await db.subscriptionPlan.count({ where: { id } }))) throw new AppError("NOT_FOUND");
  const row = await db.scheduledPlanChange.create({ data: { planId: id, changes: input.changes as object, effectiveAt: input.effectiveAt, createdById: actor.id } });
  await writeAudit({ actor, action: "plan.schedule_change", resourceType: "SubscriptionPlan", resourceId: id, after: { changes: input.changes as object, effectiveAt: input.effectiveAt.toISOString() }, req });
  return row;
}

export const listScheduled = (actor: Actor, planId: string) =>
  authorize(actor, "pricing:manage").then(() => db.scheduledPlanChange.findMany({ where: { planId }, orderBy: { effectiveAt: "asc" } }));

/** Called from the daily lifecycle job. */
export async function applyScheduledChanges(now = new Date()) {
  const due = await db.scheduledPlanChange.findMany({ where: { appliedAt: null, effectiveAt: { lte: now } } });
  for (const c of due) {
    await db.$transaction(async (tx) => {
      const before = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: c.planId } });
      const changes = c.changes as Record<string, unknown>;
      await tx.subscriptionPlan.update({ where: { id: c.planId }, data: { ...(changes as object), version: { increment: 1 } } });
      await tx.planPriceHistory.createMany({
        data: Object.entries(changes).map(([field, v]) => ({ planId: c.planId, field, oldValue: JSON.stringify(before[field as keyof typeof before]), newValue: JSON.stringify(v), changedById: c.createdById, effectiveAt: c.effectiveAt })),
      });
      await tx.scheduledPlanChange.update({ where: { id: c.id }, data: { appliedAt: now } });
    });
  }
  return due.length;
}
