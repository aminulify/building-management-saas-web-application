import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { activeUserIds, notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { getSetting } from "@/modules/admin/settings.service";
import type { Actor } from "@/lib/auth/require-actor";
import { CYCLE_MONTHS } from "@/shared/pricing";
import { retargetLinks } from "@/modules/tenancy/roles";
import { buildQuote, assertCanBuy } from "./quote.service";
import type { upgradeRequestSchema } from "./upgrade-schema";

const GRACE_DAYS = 3;

export const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
};

/** One shared flow for first purchase, renewal, plan change and Seller Plan. Nothing unlocks until a Super Admin approves. */
export async function createUpgradeRequest(actor: Actor, input: z.infer<typeof upgradeRequestSchema>, req: Request) {
  await authorize(actor, "upgrade:request", { ownerId: actor.id });
  rateLimit(`upgrade:${actor.id}`, 5, 3600_000);

  const pending = await db.upgradeRequest.findFirst({ where: { userId: actor.id, status: "PENDING" } });
  if (pending) throw new AppError("UPGRADE_ALREADY_PENDING");

  const quote = await buildQuote(actor, input.planId, input.cycle); // recomputed server-side; client amount is never trusted
  const amount = new Prisma.Decimal(quote.payable);

  try {
    return await db.$transaction(async (tx) => {
      const r = await tx.upgradeRequest.create({
        data: {
          userId: actor.id, planId: input.planId, cycle: input.cycle, expectedAmount: amount,
          quoteSnapshot: JSON.parse(JSON.stringify(quote)), senderNumber: input.senderNumber, trxId: input.trxId,
          fromRole: actor.role, toRole: quote.plan.audience === "OWNER" ? "OWNER" : actor.role,
        },
      });
      await tx.paymentTransaction.create({
        data: { userId: actor.id, purpose: "SUBSCRIPTION", upgradeRequestId: r.id, amount, gateway: "MANUAL_BKASH", gatewayTxnId: input.trxId, status: "PENDING_REVIEW" },
      });
      await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "upgrade.new", titleKey: "notifications.upgradeNew", params: { user: actor.username }, link: "/admin/upgrade-requests", priority: "HIGH" }, tx);
      await tx.outboxEvent.create({ data: { type: "upgrade.new", payload: { requestId: r.id } } }); // realtime: upgrade:new
      await writeAudit({ actor, action: "upgrade.request", resourceType: "UpgradeRequest", resourceId: r.id, after: { planId: input.planId, cycle: input.cycle, amount: quote.payable }, req }, tx);
      return r;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String((e.meta as { target?: unknown })?.target ?? "");
      throw new AppError(target.includes("trxId") || target.includes("gatewayTxnId") ? "TRXID_ALREADY_USED" : "UPGRADE_ALREADY_PENDING");
    }
    throw e;
  }
}

export const myRequests = (actor: Actor) =>
  db.upgradeRequest.findMany({ where: { userId: actor.id }, include: { plan: { select: { code: true, nameEn: true, nameBn: true } } }, orderBy: { id: "desc" }, take: 20 });

export async function cancelRequest(actor: Actor, id: string, req: Request) {
  const r = await db.upgradeRequest.findUnique({ where: { id } });
  if (!r || r.userId !== actor.id) throw new AppError("NOT_FOUND");
  if (r.status !== "PENDING") throw new AppError("INVALID_STATE", { from: r.status });
  return db.$transaction(async (tx) => {
    const out = await tx.upgradeRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.paymentTransaction.updateMany({ where: { upgradeRequestId: id }, data: { status: "FAILED" } });
    await writeAudit({ actor, action: "upgrade.cancel", resourceType: "UpgradeRequest", resourceId: id, req }, tx);
    return out;
  });
}

export async function listForReview(actor: Actor, status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED") {
  await authorize(actor, "upgrade:review");
  const rows = await db.upgradeRequest.findMany({
    where: { status },
    include: { plan: { select: { code: true, nameEn: true } }, user: { select: { id: true, fullName: true, username: true, phone: true, role: true } } },
    orderBy: { id: "asc" },
    take: 100,
  });
  const now = Date.now();
  return rows.map((r) => {
    const waitingHours = Math.floor((now - r.createdAt.getTime()) / 3600_000);
    return { ...r, waitingHours, overdue: r.status === "PENDING" && waitingHours >= 24 };
  });
}

/** Architecture 9.3: everything happens in one transaction. */
export async function approve(actor: Actor, id: string, req: Request) {
  await authorize(actor, "upgrade:review");
  const preview = await db.upgradeRequest.findUnique({ where: { id }, include: { plan: true, user: true } });
  if (!preview) throw new AppError("NOT_FOUND");
  if (preview.userId === actor.id) throw new AppError("FORBIDDEN", { reason: "self_approval" });
  await assertCanBuy({ id: preview.userId, role: preview.user.role, username: preview.user.username, fullName: preview.user.fullName }, preview.plan);

  const graceDays = await getSetting("billing.graceDays", GRACE_DAYS);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UpgradeRequest" WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.upgradeRequest.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    if (r.status !== "PENDING") throw new AppError("INVALID_STATE", { from: r.status });

    const months = CYCLE_MONTHS[r.cycle];
    const live = await tx.userSubscription.findFirst({ where: { userId: r.userId, audience: r.plan.audience, status: { in: ["ACTIVE", "GRACE"] } } });
    const now = new Date();
    // renewal of the same plan stacks onto the remaining time; plan changes start now
    const startsAt = live && live.planId === r.planId && live.endsAt && live.endsAt > now ? live.endsAt : now;
    const endsAt = addMonths(startsAt, months);
    if (live) await tx.userSubscription.update({ where: { id: live.id }, data: { status: "CANCELLED" } });

    const { id: _pid, createdAt: _c, updatedAt: _u, ...planFields } = r.plan;
    const sub = await tx.userSubscription.create({
      data: {
        userId: r.userId, planId: r.planId, audience: r.plan.audience, cycle: r.cycle, amount: r.expectedAmount,
        planSnapshot: JSON.parse(JSON.stringify({ ...planFields, planId: r.planId })),
        startsAt, endsAt, graceEndsAt: new Date(endsAt.getTime() + graceDays * 86400_000), status: "ACTIVE",
      },
    });

    await tx.upgradeRequest.update({ where: { id }, data: { status: "APPROVED", reviewerId: actor.id, reviewedAt: now } });
    const txn = await tx.paymentTransaction.update({
      where: { gatewayTxnId: r.trxId },
      data: { status: "SUCCESS", gateway: "MANUAL_BKASH", subscriptionId: sub.id, verifiedAt: now },
    });

    let ownerCode: string | undefined;
    if (r.plan.audience === "OWNER") {
      const u = await tx.user.findUniqueOrThrow({ where: { id: r.userId }, select: { role: true, ownerCode: true } });
      if (u.role !== "OWNER") { await tx.user.update({ where: { id: r.userId }, data: { role: "OWNER" } }); await retargetLinks(tx, r.userId, "OWNER"); }
      await tx.ownerProfile.upsert({ where: { userId: r.userId }, update: {}, create: { userId: r.userId } });
      if (!u.ownerCode) {
        const [{ n }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('owner_code_seq')::text AS n`;
        ownerCode = `OW${n}`;
        await tx.user.update({ where: { id: r.userId }, data: { ownerCode } });
      }
    }

    const [{ n: invNo }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('invoice_number_seq')::text AS n`;
    await tx.invoice.create({ data: { transactionId: txn.id, number: `INV-${invNo}` } });

    await notify([r.userId], { type: "upgrade.approved", titleKey: "notifications.upgradeApproved", params: { plan: r.plan.code }, link: r.plan.audience === "OWNER" ? "/home-owner/dashboard" : "/marketplace/create", priority: "HIGH" }, tx);
    await tx.outboxEvent.create({ data: { type: "account.upgraded", payload: { userId: r.userId, requestId: id } } }); // realtime + SMS
    await writeAudit({ actor, action: "upgrade.approve", resourceType: "UpgradeRequest", resourceId: id, before: { status: "PENDING", role: r.fromRole }, after: { status: "APPROVED", subscriptionId: sub.id, ownerCode: ownerCode ?? null }, req }, tx);
    return { requestId: id, subscriptionId: sub.id, startsAt, endsAt, ownerCode: ownerCode ?? null, invoice: `INV-${invNo}` };
  });
}

export async function reject(actor: Actor, id: string, reason: string, req: Request) {
  await authorize(actor, "upgrade:review");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UpgradeRequest" WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.upgradeRequest.findUnique({ where: { id } });
    if (!r) throw new AppError("NOT_FOUND");
    if (r.status !== "PENDING") throw new AppError("INVALID_STATE", { from: r.status });
    const out = await tx.upgradeRequest.update({ where: { id }, data: { status: "REJECTED", reviewerId: actor.id, reviewedAt: new Date(), rejectionReason: reason } });
    await tx.paymentTransaction.updateMany({ where: { upgradeRequestId: id }, data: { status: "FAILED" } });
    await notify([r.userId], { type: "upgrade.rejected", titleKey: "notifications.upgradeRejected", params: { reason }, priority: "HIGH" }, tx);
    await writeAudit({ actor, action: "upgrade.reject", resourceType: "UpgradeRequest", resourceId: id, after: { reason }, req }, tx);
    return out;
  });
}
