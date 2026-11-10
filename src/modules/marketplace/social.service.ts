import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { findOrCreatePair } from "@/modules/messaging/service";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import type { inquirySchema, reportSchema, savedSearchSchema } from "./schema";

const published = async (id: string) => {
  const l = await db.listing.findFirst({ where: { id, status: "PUBLISHED" } });
  if (!l) throw new AppError("NOT_FOUND");
  return l;
};

export async function addFavorite(actor: Actor, listingId: string) {
  await authorize(actor, "favorite:manage");
  await published(listingId);
  await db.favorite.upsert({ where: { userId_listingId: { userId: actor.id, listingId } }, update: {}, create: { userId: actor.id, listingId } });
  return { favorite: true };
}

export async function removeFavorite(actor: Actor, listingId: string) {
  await authorize(actor, "favorite:manage");
  await db.favorite.deleteMany({ where: { userId: actor.id, listingId } });
  return { favorite: false };
}

export async function myFavorites(actor: Actor) {
  await authorize(actor, "favorite:manage");
  return db.favorite.findMany({
    where: { userId: actor.id, listing: { status: "PUBLISHED" } }, orderBy: { id: "desc" }, take: 100,
    include: { listing: { select: { id: true, title: true, price: true, type: true, category: true, images: { take: 1, orderBy: { order: "asc" } } } } },
  });
}

export async function reportListing(actor: Actor, listingId: string, input: z.infer<typeof reportSchema>) {
  await authorize(actor, "listing:report");
  const l = await published(listingId);
  if (l.sellerId === actor.id) throw new AppError("FORBIDDEN", { reason: "own_listing" });
  for (const k of input.evidence) if (k.split("/")[0] !== "REPORT_EVIDENCE" || k.split("/")[1] !== actor.id) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  try {
    return await db.listingReport.create({ data: { listingId, reporterId: actor.id, ...input } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { reason: "already_reported" });
    throw e;
  }
}

/** Opens (or reuses) a LISTING_INQUIRY conversation between seeker and seller, scoped to that listing (D7). */
export async function inquire(actor: Actor, listingId: string, input: z.infer<typeof inquirySchema>) {
  const l = await published(listingId);
  if (l.sellerId === actor.id) throw new AppError("FORBIDDEN", { reason: "own_listing" });
  const seller = await db.user.findFirst({ where: { id: l.sellerId, status: "ACTIVE" }, select: { id: true } });
  if (!seller) throw new AppError("NOT_FOUND");

  const conv = await findOrCreatePair("LISTING_INQUIRY", actor.id, seller.id, listingId);
  const day = new Date(new Date().toISOString().slice(0, 10));
  await db.$transaction(async (tx) => {
    await tx.message.create({ data: { conversationId: conv.id, senderId: actor.id, clientId: crypto.randomUUID(), body: input.message } });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    await tx.listingStatDaily.upsert({ where: { listingId_date: { listingId, date: day } }, update: { inquiries: { increment: 1 } }, create: { listingId, date: day, inquiries: 1 } });
    await notify([seller.id], { type: "listing.inquiry", titleKey: "notifications.listingInquiry", params: { title: l.title, from: actor.fullName }, link: `/messages/${conv.id}` }, tx);
  });
  return { conversationId: conv.id };
}

export const listSavedSearches = (actor: Actor) => db.savedSearch.findMany({ where: { userId: actor.id }, orderBy: { id: "desc" }, take: 20 });

export async function addSavedSearch(actor: Actor, input: z.infer<typeof savedSearchSchema>) {
  if ((await db.savedSearch.count({ where: { userId: actor.id } })) >= 20) throw new AppError("PLAN_LIMIT_REACHED", { kind: "saved_search", cap: 20 });
  return db.savedSearch.create({ data: { userId: actor.id, query: input.query as Prisma.InputJsonValue } });
}

export async function deleteSavedSearch(actor: Actor, id: string) {
  const r = await db.savedSearch.deleteMany({ where: { id, userId: actor.id } });
  if (r.count === 0) throw new AppError("NOT_FOUND");
  return { deleted: true };
}

/**
 * "Call Owner": the phone number is only handed to a signed-in person who asks for it on a published listing
 * (20 per hour, written to the audit log), so crawlers cannot harvest numbers from the public pages.
 */
export async function revealContact(actor: Actor, listingId: string, req: Request) {
  rateLimit(`contact:${actor.id}`, 20, 3600_000);
  const l = await published(listingId);
  if (l.sellerId === actor.id) throw new AppError("FORBIDDEN", { reason: "own_listing" });
  const seller = await db.user.findFirst({ where: { id: l.sellerId, status: "ACTIVE" }, select: { fullName: true, phone: true, email: true } });
  if (!seller || (!seller.phone && !seller.email)) throw new AppError("NOT_FOUND", { reason: "no_contact" });
  await writeAudit({ actor, action: "listing.contact_reveal", resourceType: "Listing", resourceId: listingId, req });
  return { name: seller.fullName, phone: seller.phone, email: seller.email };
}
