import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { pageArgs, pageResult } from "@/lib/api/common";
import { patchSettings } from "@/modules/admin/settings.service";
import { locationLabel } from "@/modules/marketplace/search.service";
import { signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { addDays, boostState, type boostEditSchema, type boostListQuery, type boostSettingsPatch } from "./rules";
import { expireBoosts, readBoostSettings } from "./service";

/** Where each tab of the Paid Boost table looks. Active / Expired are decided by the end date. */
const live: Prisma.ListingBoostWhereInput = { deletedAt: null };
const FAILED: Prisma.ListingBoostWhereInput = { OR: [{ status: { in: ["REJECTED", "CANCELLED"] } }, { transactions: { some: { status: "FAILED" } } }] };
const tabWhere = (tab: z.infer<typeof boostListQuery>["status"], now: Date): Prisma.ListingBoostWhereInput =>
  tab === "failed" ? FAILED
  : tab === "pending" ? { status: "PENDING" }
  : tab === "active" ? { status: "APPROVED", endsAt: { gt: now } }
  : tab === "expired" ? { status: "APPROVED", endsAt: { lte: now } }
  : tab === "rejected" ? { status: { in: ["REJECTED", "CANCELLED"] } }
  : {};

/** Numbers on top of the Paid Boost page. Revenue = verified boost payments. */
export async function boostStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  await expireBoosts(true);
  const now = new Date();
  const count = (tab: Parameters<typeof tabWhere>[0]) => db.listingBoost.count({ where: { AND: [live, tabWhere(tab, now)] } });
  const [pending, active, expired, rejected, failed, total, revenue] = await Promise.all([
    count("pending"), count("active"), count("expired"), count("rejected"), count("failed"), count("all"),
    db.paymentTransaction.aggregate({ where: { purpose: "PROMOTION", status: "SUCCESS" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return { pending, active, expired, rejected, failed, total, revenue: (revenue._sum.amount ?? 0).toString(), paidCount: revenue._count._all };
}

export async function boostList(actor: Actor, q: z.infer<typeof boostListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  await expireBoosts(true);
  const now = new Date();
  const and: Prisma.ListingBoostWhereInput[] = [live, tabWhere(q.status, now)];
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    and.push({ OR: [{ trxId: has(q.q) }, { senderNumber: { contains: q.q } }, { listing: { title: has(q.q) } }, { user: { fullName: has(q.q) } }, { user: { email: has(q.q) } }, { user: { phone: { contains: q.q } } }, { user: { ownerCode: has(q.q) } }] });
  }
  const where: Prisma.ListingBoostWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.listingBoost.findMany({
      where, ...pageArgs(q),
      select: {
        id: true, amount: true, durationDays: true, senderNumber: true, trxId: true, status: true, startsAt: true, endsAt: true, reviewedAt: true, rejectionReason: true, createdAt: true,
        user: { select: { id: true, fullName: true, phone: true, email: true, ownerCode: true } },
        listing: { select: { id: true, title: true, type: true, price: true, status: true, unionName: true, upazila: true, district: true, postalCode: true, fullAddress: true, images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } } } },
        transactions: { select: { status: true, verifiedAt: true }, take: 1 },
      },
    }),
    db.listingBoost.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const urls = await signStorageKeys(page.items.flatMap((b) => b.listing.images.map((i) => i.storageKey)), 3600);
  const items = page.items.map(({ transactions, amount, listing: { images, price, ...l }, ...b }) => ({
    ...b, amount: amount.toString(), state: boostState(b, now), paymentStatus: transactions[0]?.status ?? null,
    listing: { ...l, price: price.toString(), location: locationLabel(l) || l.fullAddress || "", thumbnailUrl: images[0] ? urls.get(images[0].storageKey) ?? null : null },
  }));
  return { items, nextCursor: page.nextCursor, total };
}

/** Payment verified: the boost starts now and the listing is featured until it ends. */
export async function approveBoost(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ListingBoost" WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.listingBoost.findUnique({ where: { id }, include: { listing: { select: { id: true, title: true, status: true } } } });
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "PENDING") throw new AppError("INVALID_STATE", { from: b.status });
    if (b.listing.status !== "PUBLISHED") throw new AppError("INVALID_STATE", { reason: "listing_not_live", from: b.listing.status });
    const now = new Date();
    const endsAt = addDays(now, b.durationDays);
    await tx.listingBoost.update({ where: { id }, data: { status: "APPROVED", reviewerId: actor.id, reviewedAt: now, startsAt: now, endsAt } });
    await tx.listing.update({ where: { id: b.listingId }, data: { isFeatured: true, boostEndsAt: endsAt } });
    const txn = await tx.paymentTransaction.update({ where: { gatewayTxnId: b.trxId }, data: { status: "SUCCESS", verifiedAt: now } });
    const [{ n }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('invoice_number_seq')::text AS n`;
    await tx.invoice.create({ data: { transactionId: txn.id, number: `INV-${n}` } });
    await notify([b.userId], { type: "boost.approved", titleKey: "notifications.boost_approved", params: { title: b.listing.title, days: String(b.durationDays) }, link: "/home-owner/marketplace" }, tx);
    await writeAudit({ actor, action: "boost.approve", resourceType: "ListingBoost", resourceId: id, after: { listingId: b.listingId, endsAt }, req }, tx);
    return { id, status: "APPROVED" as const, startsAt: now, endsAt, invoice: `INV-${n}` };
  });
}

export async function rejectBoost(actor: Actor, id: string, reason: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ListingBoost" WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.listingBoost.findUnique({ where: { id }, include: { listing: { select: { title: true } } } });
    if (!b) throw new AppError("NOT_FOUND");
    if (b.status !== "PENDING") throw new AppError("INVALID_STATE", { from: b.status });
    await tx.listingBoost.update({ where: { id }, data: { status: "REJECTED", reviewerId: actor.id, reviewedAt: new Date(), rejectionReason: reason } });
    await tx.paymentTransaction.updateMany({ where: { boostId: id }, data: { status: "FAILED" } });
    await notify([b.userId], { type: "boost.rejected", titleKey: "notifications.boost_rejected", params: { title: b.listing.title, reason }, link: "/home-owner/marketplace", priority: "HIGH" }, tx);
    await writeAudit({ actor, action: "boost.reject", resourceType: "ListingBoost", resourceId: id, after: { reason }, req }, tx);
    return { id, status: "REJECTED" as const };
  });
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/** Take the pin of a listing away (only when the pin came from a boost: a listing featured by hand has no boost end date). */
const unpin = (tx: Prisma.TransactionClient, listingId: string) => tx.listing.updateMany({ where: { id: listingId, boostEndsAt: { not: null } }, data: { isFeatured: false, boostEndsAt: null } });

/**
 * Super Admin edits a boost. `state` moves it to Active (paid, pinned for its days from now), Expired (ends now) or Payment failed;
 * `durationDays` changes how long it runs (an Active boost ends that many days after it started).
 */
export async function editBoost(actor: Actor, id: string, input: z.infer<typeof boostEditSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ListingBoost" WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.listingBoost.findFirst({ where: { id, deletedAt: null }, include: { listing: { select: { id: true, title: true, status: true } } } });
    if (!b) throw new AppError("NOT_FOUND");
    const now = new Date();
    const was = boostState(b, now);
    const days = input.durationDays ?? b.durationDays;
    const target = input.state ?? (was === "ACTIVE" ? "ACTIVE" : was === "EXPIRED" ? "EXPIRED" : was === "PENDING" ? "PENDING" : "FAILED");
    const before = { state: was, durationDays: b.durationDays, endsAt: b.endsAt };
    let after: Record<string, unknown> = {};

    if (target === "ACTIVE") {
      if (b.listing.status !== "PUBLISHED") throw new AppError("INVALID_STATE", { reason: "listing_not_live", from: b.listing.status });
      const fresh = was !== "ACTIVE";                                // pending, failed or expired: starts again from now
      const startsAt = fresh || !b.startsAt ? now : b.startsAt;
      const endsAt = addDays(startsAt, days);
      if (endsAt.getTime() <= now.getTime()) throw new AppError("INVALID_STATE", { reason: "ends_in_past" });
      await tx.listingBoost.update({ where: { id }, data: { status: "APPROVED", durationDays: days, startsAt, endsAt, rejectionReason: null, reviewerId: actor.id, reviewedAt: now } });
      await tx.listing.update({ where: { id: b.listingId }, data: { isFeatured: true, boostEndsAt: endsAt } });
      if (fresh) {
        const txn = await tx.paymentTransaction.update({ where: { gatewayTxnId: b.trxId }, data: { status: "SUCCESS", verifiedAt: now } });
        if (!(await tx.invoice.findUnique({ where: { transactionId: txn.id } }))) {
          const [{ n }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('invoice_number_seq')::text AS n`;
          await tx.invoice.create({ data: { transactionId: txn.id, number: `INV-${n}` } });
        }
        await notify([b.userId], { type: "boost.approved", titleKey: "notifications.boost_approved", params: { title: b.listing.title, days: String(days) }, link: "/home-owner/marketplace" }, tx);
      }
      after = { state: "ACTIVE", durationDays: days, endsAt };
    } else if (target === "EXPIRED") {
      if (was === "PENDING" || was === "REJECTED" || was === "CANCELLED") throw new AppError("INVALID_STATE", { reason: "never_started", from: was });
      const startsAt = b.startsAt ?? now;
      const endsAt = was === "ACTIVE" ? now : b.endsAt ?? now;
      await tx.listingBoost.update({ where: { id }, data: { durationDays: days, startsAt, endsAt } });
      await unpin(tx, b.listingId);
      after = { state: "EXPIRED", durationDays: days, endsAt };
    } else if (target === "FAILED") {
      // the money was taken for an Active or Expired boost, so it is not turned into "failed" quietly
      if (was === "ACTIVE" || was === "EXPIRED") throw new AppError("INVALID_STATE", { reason: "already_paid", from: was });
      const reason = input.reason ?? b.rejectionReason;
      if (!reason) throw new AppError("VALIDATION_ERROR", { fields: { reason: "required" } });
      await tx.listingBoost.update({ where: { id }, data: { status: "REJECTED", durationDays: days, rejectionReason: reason, reviewerId: actor.id, reviewedAt: now } });
      await tx.paymentTransaction.updateMany({ where: { boostId: id }, data: { status: "FAILED" } });
      if (was === "PENDING") await notify([b.userId], { type: "boost.rejected", titleKey: "notifications.boost_rejected", params: { title: b.listing.title, reason }, link: "/home-owner/marketplace", priority: "HIGH" }, tx);
      after = { state: "FAILED", reason };
    } else {
      await tx.listingBoost.update({ where: { id }, data: { durationDays: days } });
      after = { state: "PENDING", durationDays: days };
    }
    await writeAudit({ actor, action: "boost.edit", resourceType: "ListingBoost", resourceId: id, before: json(before), after: json(after), req }, tx);
    return { id, ...after };
  });
}

/** Remove a boost from the table. An Active boost stops pinning its listing. The row and its payment record stay (soft delete). */
export async function deleteBoost(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ListingBoost" WHERE id = ${id}::uuid FOR UPDATE`;
    const b = await tx.listingBoost.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw new AppError("NOT_FOUND");
    const now = new Date();
    const was = boostState(b, now);
    await tx.listingBoost.update({ where: { id }, data: { deletedAt: now, ...(was === "PENDING" ? { status: "CANCELLED" as const } : {}) } });
    if (was === "PENDING") await tx.paymentTransaction.updateMany({ where: { boostId: id }, data: { status: "FAILED" } });
    if (was === "ACTIVE") await unpin(tx, b.listingId);
    await writeAudit({ actor, action: "boost.delete", resourceType: "ListingBoost", resourceId: id, before: json({ state: was }), req }, tx);
    return { id, deleted: true as const };
  });
}

export async function getBoostSettings(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  return readBoostSettings();
}

/** Turn Paid Boost on or off, set the fee (৳) and how many days a boost lasts. Goes through the shared settings writer (validated, audited). */
export async function saveBoostSettings(actor: Actor, input: z.infer<typeof boostSettingsPatch>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  await patchSettings(actor, Object.fromEntries(Object.entries({ "boost.enabled": input.enabled, "boost.fee": input.fee, "boost.durationDays": input.durationDays }).filter(([, v]) => v !== undefined)), req);
  return readBoostSettings();
}
