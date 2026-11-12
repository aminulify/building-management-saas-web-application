import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { rateLimit } from "@/lib/rate-limit";
import { activeUserIds, notify } from "@/lib/notify";
import { getSetting } from "@/modules/admin/settings.service";
import { getPaymentInfo } from "@/modules/billing/quote.service";
import type { Actor } from "@/lib/auth/require-actor";
import { BOOST_DEFAULTS, boostState, type BoostState, type boostRequestSchema } from "./rules";

/** The three boost settings the Super Admin controls. */
export async function readBoostSettings() {
  const [enabled, fee, durationDays] = await Promise.all([
    getSetting("boost.enabled", BOOST_DEFAULTS.enabled), getSetting("boost.fee", BOOST_DEFAULTS.fee), getSetting("boost.durationDays", BOOST_DEFAULTS.durationDays),
  ]);
  return { enabled, fee: Number(fee).toFixed(2), durationDays };
}

/**
 * Boosts whose time is over stop featuring their listing. Runs when the feed or a boost screen is read (at most once a minute),
 * so a listing never stays pinned past the end of the boost, with no background job to forget.
 * Only listings that have a boost end date are touched: a listing the Super Admin featured by hand stays featured.
 */
let lastExpiry = 0;
export async function expireBoosts(force = false) {
  const now = Date.now();
  if (!force && now - lastExpiry < 60_000) return 0;
  lastExpiry = now;
  return db.$executeRaw`UPDATE "Listing" SET "isFeatured" = false, "boostEndsAt" = NULL WHERE "boostEndsAt" IS NOT NULL AND "boostEndsAt" <= now()`;
}

/** What the payment page needs: the fee, how long it lasts, and where to send the money. */
export async function boostSettingsForOwner(actor: Actor) {
  await authorize(actor, "listing:manage", { ownerId: actor.id });
  const [s, pay] = await Promise.all([readBoostSettings(), getPaymentInfo()]);
  return { ...s, payment: { method: "BKASH_SEND_MONEY" as const, number: pay.bkashPersonalNumber, reference: actor.username } };
}

/** The latest boost of each listing, as the "Boost" button needs it: Active (until when), Pending, or the last rejection. */
export async function boostInfoFor(listingIds: string[]) {
  if (listingIds.length === 0) return new Map<string, { state: BoostState; endsAt: Date | null; reason: string | null }>();
  await expireBoosts();
  const rows = await db.listingBoost.findMany({ where: { listingId: { in: listingIds } }, orderBy: { id: "desc" }, select: { listingId: true, status: true, endsAt: true, rejectionReason: true } });
  const out = new Map<string, { state: BoostState; endsAt: Date | null; reason: string | null }>();
  for (const r of rows) if (!out.has(r.listingId)) out.set(r.listingId, { state: boostState(r), endsAt: r.endsAt, reason: r.rejectionReason });
  return out;
}

export async function requestBoost(actor: Actor, input: z.infer<typeof boostRequestSchema>, req: Request) {
  await authorize(actor, "listing:manage", { ownerId: actor.id });
  rateLimit(`boost:${actor.id}`, 10, 3600_000);
  await expireBoosts();
  const settings = await readBoostSettings();
  if (!settings.enabled) throw new AppError("INVALID_STATE", { reason: "boost_disabled" });

  const l = await db.listing.findUnique({ where: { id: input.listingId }, select: { id: true, sellerId: true, status: true, title: true, boostEndsAt: true } });
  if (!l || l.sellerId !== actor.id) throw new AppError("NOT_FOUND");
  if (l.status !== "PUBLISHED") throw new AppError("INVALID_STATE", { reason: "listing_not_live", from: l.status });
  if (l.boostEndsAt && l.boostEndsAt.getTime() > Date.now()) throw new AppError("INVALID_STATE", { reason: "already_boosted" });
  if (await db.listingBoost.count({ where: { listingId: l.id, status: "PENDING" } })) throw new AppError("INVALID_STATE", { reason: "boost_pending" });

  const amount = new Prisma.Decimal(settings.fee);
  try {
    return await db.$transaction(async (tx) => {
      const b = await tx.listingBoost.create({ data: { listingId: l.id, userId: actor.id, amount, durationDays: settings.durationDays, senderNumber: input.senderNumber, trxId: input.trxId } });
      await tx.paymentTransaction.create({ data: { userId: actor.id, purpose: "PROMOTION", boostId: b.id, amount, gateway: "MANUAL_BKASH", gatewayTxnId: input.trxId, status: "PENDING_REVIEW" } });
      await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "boost.new", titleKey: "notifications.boost_new", params: { user: actor.username, title: l.title }, link: "/admin/paid-boost", priority: "HIGH" }, tx);
      await writeAudit({ actor, action: "boost.request", resourceType: "ListingBoost", resourceId: b.id, after: { listingId: l.id, amount: settings.fee, days: settings.durationDays }, req }, tx);
      return { id: b.id, listingId: b.listingId, amount: b.amount.toString(), durationDays: b.durationDays, status: b.status, createdAt: b.createdAt };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String((e.meta as { target?: unknown })?.target ?? "");
      throw new AppError(target.includes("trxId") || target.includes("gatewayTxnId") ? "TRXID_ALREADY_USED" : "INVALID_STATE", target.includes("trxId") || target.includes("gatewayTxnId") ? undefined : { reason: "boost_pending" });
    }
    throw e;
  }
}

/** The seller's own boost requests (newest first), optionally for one listing. */
export async function myBoosts(actor: Actor, listingId?: string) {
  await authorize(actor, "listing:manage", { ownerId: actor.id });
  await expireBoosts();
  const rows = await db.listingBoost.findMany({
    where: { userId: actor.id, ...(listingId ? { listingId } : {}) }, orderBy: { id: "desc" }, take: 20,
    select: { id: true, listingId: true, amount: true, durationDays: true, status: true, trxId: true, startsAt: true, endsAt: true, rejectionReason: true, createdAt: true, listing: { select: { title: true } }, transactions: { select: { status: true }, take: 1 } },
  });
  return { items: rows.map(({ transactions, amount, ...b }) => ({ ...b, amount: amount.toString(), state: boostState(b), paymentStatus: transactions[0]?.status ?? null })) };
}

/** The seller withdraws a boost that is still waiting for review. */
export async function cancelBoost(actor: Actor, id: string, req: Request) {
  await authorize(actor, "listing:manage", { ownerId: actor.id });
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ListingBoost" WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.listingBoost.findUnique({ where: { id } });
    if (!b || b.userId !== actor.id) throw new AppError("NOT_FOUND");
    if (b.status !== "PENDING") throw new AppError("INVALID_STATE", { from: b.status });
    await tx.listingBoost.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.paymentTransaction.updateMany({ where: { boostId: id }, data: { status: "FAILED" } });
    await writeAudit({ actor, action: "boost.cancel", resourceType: "ListingBoost", resourceId: id, req }, tx);
    return { id, status: "CANCELLED" as const };
  });
}
