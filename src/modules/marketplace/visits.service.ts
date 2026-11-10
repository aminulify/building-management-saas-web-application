import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey } from "@/modules/uploads/service";
import type { visitCreateSchema, visitListQuery, visitRespondSchema } from "./schema";

const MIN_LEAD_MS = 30 * 60_000;
const MAX_LEAD_MS = 60 * 86_400_000;
/** Visits happen between 08:00 and 21:00 Bangladesh time (UTC+6). */
export const visitHourOk = (d: Date) => { const h = (d.getUTCHours() + 6) % 24; return h >= 8 && h < 21; };

/** A seeker asks to see a published listing at a chosen date and time. The seller is notified and answers. */
export async function requestVisit(actor: Actor, listingId: string, input: z.infer<typeof visitCreateSchema>, req: Request) {
  rateLimit(`visit:${actor.id}`, 10, 3600_000);
  const l = await db.listing.findFirst({ where: { id: listingId, status: "PUBLISHED" }, select: { id: true, sellerId: true, title: true } });
  if (!l) throw new AppError("NOT_FOUND");
  if (l.sellerId === actor.id) throw new AppError("FORBIDDEN", { reason: "own_listing" });
  const lead = input.scheduledFor.getTime() - Date.now();
  if (lead < MIN_LEAD_MS) throw new AppError("VALIDATION_ERROR", [{ path: "scheduledFor", code: "too_soon" }]);
  if (lead > MAX_LEAD_MS) throw new AppError("VALIDATION_ERROR", [{ path: "scheduledFor", code: "too_far" }]);
  if (!visitHourOk(input.scheduledFor)) throw new AppError("VALIDATION_ERROR", [{ path: "scheduledFor", code: "outside_visiting_hours" }]);

  try {
    return await db.$transaction(async (tx) => {
      const v = await tx.visitRequest.create({ data: { listingId, requesterId: actor.id, sellerId: l.sellerId, scheduledFor: input.scheduledFor, note: input.note } });
      await notify([l.sellerId], { type: "listing.visit", titleKey: "notifications.visitRequested", params: { title: l.title, from: actor.fullName, when: input.scheduledFor.toISOString() }, link: "/owner/visits", priority: "HIGH" }, tx);
      await writeAudit({ actor, action: "listing.visit_request", resourceType: "VisitRequest", resourceId: v.id, after: { listingId, scheduledFor: input.scheduledFor.toISOString() }, req }, tx);
      return v;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { reason: "visit_already_requested" });
    throw e;
  }
}

export async function myVisits(actor: Actor, q: z.infer<typeof visitListQuery>) {
  const mine = q.as === "seller" ? { sellerId: actor.id } : { requesterId: actor.id };
  const rows = await db.visitRequest.findMany({
    where: { ...mine, status: q.status }, orderBy: [{ scheduledFor: "asc" }, { id: "desc" }], take: 100,
    include: { listing: { select: { id: true, title: true, price: true, type: true, fullAddress: true, upazila: true, district: true, images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } } } } },
  });
  const people = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => (q.as === "seller" ? r.requesterId : r.sellerId)) } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return Promise.all(rows.map(async ({ listing, ...v }) => ({
    ...v,
    with: people.get(q.as === "seller" ? v.requesterId : v.sellerId) ?? null,
    listing: { ...listing, images: undefined, coverUrl: listing.images[0] ? await signStorageKey(listing.images[0].storageKey, 3600).then((s) => s.url).catch(() => null) : null },
  })));
}

/** Seller confirms or declines a pending request; the seeker is notified. */
export async function respondVisit(actor: Actor, id: string, input: z.infer<typeof visitRespondSchema>, req: Request) {
  const v = await db.visitRequest.findUnique({ where: { id }, include: { listing: { select: { title: true } } } });
  if (!v || v.sellerId !== actor.id) throw new AppError("NOT_FOUND");
  if (v.status !== "PENDING") throw new AppError("INVALID_STATE", { from: v.status });
  const status = input.action === "confirm" ? "CONFIRMED" : "DECLINED";
  return db.$transaction(async (tx) => {
    const out = await tx.visitRequest.update({ where: { id }, data: { status, responseNote: input.note } });
    await notify([v.requesterId], { type: "listing.visit", titleKey: status === "CONFIRMED" ? "notifications.visitConfirmed" : "notifications.visitDeclined", params: { title: v.listing.title, when: v.scheduledFor.toISOString() }, link: "/me/visits", priority: "HIGH" }, tx);
    await writeAudit({ actor, action: `listing.visit_${input.action}`, resourceType: "VisitRequest", resourceId: id, req }, tx);
    return out;
  });
}

/** Seeker withdraws a request that is still pending or confirmed. */
export async function cancelVisit(actor: Actor, id: string, req: Request) {
  const v = await db.visitRequest.findUnique({ where: { id }, include: { listing: { select: { title: true } } } });
  if (!v || v.requesterId !== actor.id) throw new AppError("NOT_FOUND");
  if (v.status !== "PENDING" && v.status !== "CONFIRMED") throw new AppError("INVALID_STATE", { from: v.status });
  return db.$transaction(async (tx) => {
    const out = await tx.visitRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await notify([v.sellerId], { type: "listing.visit", titleKey: "notifications.visitCancelled", params: { title: v.listing.title, from: actor.fullName }, link: "/owner/visits" }, tx);
    await writeAudit({ actor, action: "listing.visit_cancel", resourceType: "VisitRequest", resourceId: id, req }, tx);
    return out;
  });
}
