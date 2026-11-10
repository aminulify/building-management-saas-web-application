import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { getEntitlement } from "@/lib/authz/entitlement";
import { getSetting } from "@/modules/admin/settings.service";
import { applyScheduledChanges } from "./extras.service";

const GRACE_DAYS = 3;
const DAY = 86400_000;

export async function mySubscription(actor: Actor) {
  const [owner, seller, subs, pending] = await Promise.all([
    getEntitlement(actor.id, "OWNER"),
    getEntitlement(actor.id, "SELLER"),
    db.userSubscription.findMany({ where: { userId: actor.id }, orderBy: { id: "desc" }, take: 10, include: { plan: { select: { code: true, nameEn: true, nameBn: true } } } }),
    db.upgradeRequest.findFirst({ where: { userId: actor.id, status: "PENDING" }, select: { id: true, planId: true, cycle: true, createdAt: true, expectedAmount: true, trxId: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } }),
  ]);
  const live = subs.find((s) => s.status === "ACTIVE" || s.status === "GRACE");
  return { owner, seller, current: live ?? null, pendingRequest: pending, history: subs };
}

/** Billing history: only what the person needs (no raw gateway payload), with the plan each payment bought. */
export async function myPayments(actor: Actor) {
  const rows = await db.paymentTransaction.findMany({
    where: { userId: actor.id, purpose: "SUBSCRIPTION" },
    select: {
      id: true, amount: true, status: true, gateway: true, gatewayTxnId: true, createdAt: true, verifiedAt: true,
      invoice: { select: { id: true, number: true } },
      subscription: { select: { cycle: true, startsAt: true, endsAt: true, planSnapshot: true } },
      upgradeRequest: { select: { cycle: true, status: true, rejectionReason: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } },
    },
    orderBy: { id: "desc" },
    take: 50,
  });
  return rows.map(({ subscription, upgradeRequest, ...p }) => {
    const snap = (subscription?.planSnapshot ?? {}) as { code?: string; nameEn?: string; nameBn?: string };
    const plan = upgradeRequest?.plan ?? (snap.code ? { code: snap.code, nameEn: snap.nameEn ?? snap.code, nameBn: snap.nameBn ?? snap.code } : null);
    return { ...p, plan, cycle: subscription?.cycle ?? upgradeRequest?.cycle ?? null, period: subscription ? { startsAt: subscription.startsAt, endsAt: subscription.endsAt } : null, rejectionReason: upgradeRequest?.rejectionReason ?? null };
  });
}

/**
 * Daily job (09:00 Asia/Dhaka): reminders at 7/3/1 days, ACTIVE→GRACE at endsAt, GRACE→EXPIRED after grace
 * (unless a renewal request is pending), then soft-lock listings (architecture 9.4).
 */
export async function runLifecycle(now = new Date()) {
  const result = { reminded: 0, toGrace: 0, expired: 0, listingsSuspended: 0, scheduledApplied: 0 };
  const graceDays = await getSetting("billing.graceDays", GRACE_DAYS);
  result.scheduledApplied = await applyScheduledChanges(now);

  for (const days of [7, 3, 1]) {
    const from = new Date(now.getTime() + (days - 1) * DAY);
    const to = new Date(now.getTime() + days * DAY);
    const subs = await db.userSubscription.findMany({ where: { status: "ACTIVE", endsAt: { gt: from, lte: to } }, select: { userId: true } });
    await notify(subs.map((s) => s.userId), { type: "subscription.expiring", titleKey: "notifications.subscriptionExpiring", params: { days }, priority: "HIGH" });
    result.reminded += subs.length;
  }

  const due = await db.userSubscription.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } } });
  for (const s of due) {
    if (s.cancelledAt) {
      // the user cancelled: no grace period, listings are soft-locked right away
      await db.$transaction(async (tx) => {
        await tx.userSubscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
        const r = await tx.listing.updateMany({ where: { sellerId: s.userId, status: "PUBLISHED" }, data: { status: "SUSPENDED" } });
        result.listingsSuspended += r.count;
        await notify([s.userId], { type: "subscription.expired", titleKey: "notifications.subscriptionExpired", priority: "CRITICAL" }, tx);
      });
      result.expired++;
      continue;
    }
    await db.userSubscription.update({ where: { id: s.id }, data: { status: "GRACE", graceEndsAt: new Date(s.endsAt!.getTime() + graceDays * DAY) } });
    await notify([s.userId], { type: "subscription.grace", titleKey: "notifications.subscriptionGrace", priority: "CRITICAL" });
  }
  result.toGrace = due.filter((s) => !s.cancelledAt).length;

  const ended = await db.userSubscription.findMany({ where: { status: "GRACE", graceEndsAt: { lte: now } } });
  for (const s of ended) {
    const pendingRenewal = await db.upgradeRequest.count({ where: { userId: s.userId, status: "PENDING" } });
    if (pendingRenewal > 0) continue; // stays in GRACE until the Super Admin reviews it
    await db.$transaction(async (tx) => {
      await tx.userSubscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
      const r = await tx.listing.updateMany({ where: { sellerId: s.userId, status: "PUBLISHED" }, data: { status: "SUSPENDED" } });
      result.listingsSuspended += r.count;
      await notify([s.userId], { type: "subscription.expired", titleKey: "notifications.subscriptionExpired", priority: "CRITICAL" }, tx);
    });
    result.expired++;
  }
  return result;
}
