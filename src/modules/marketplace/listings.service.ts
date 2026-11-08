import type { ListingStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { setPoint } from "@/lib/geo-point";
import { authorize } from "@/lib/authz/authorize";
import { assertEntitlement } from "@/lib/authz/entitlement";
import { activeUserIds, notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { getSetting } from "@/modules/admin/settings.service";
import type { ListingAction, imageSchema, listingDocSchema, listingCreateSchema, listingUpdateSchema, myListingsQuery } from "./schema";

type Create = z.infer<typeof listingCreateSchema>;

/** `GET /listings/eligibility`. 403 LISTING_ENTITLEMENT_REQUIRED → client opens /pricing?reason=listing + toast. */
export async function eligibility(actor: Actor) {
  await authorize(actor, "listing:create");
  const ent = await assertEntitlement(actor, "listing");
  return { eligible: true, usage: ent.usage.listings, limit: ent.limits.listingLimit };
}

/** Listing must be the seller's own property/unit when linked. */
async function assertLinks(actor: Actor, propertyId?: string, unitId?: string) {
  if (propertyId && !(await db.property.count({ where: { id: propertyId, ownerId: actor.id } }))) throw new AppError("FORBIDDEN", { reason: "not_your_property" });
  if (unitId && !(await db.unit.count({ where: { id: unitId, property: { ownerId: actor.id } } }))) throw new AppError("FORBIDDEN", { reason: "not_your_unit" });
}

export async function createListing(actor: Actor, input: Create, req: Request) {
  await authorize(actor, "listing:create");
  await assertLinks(actor, input.propertyId, input.unitId);
  const { lat, lng, landDetails, ...rest } = input;
  return db.$transaction(async (tx) => {
    await assertEntitlement(actor, "listing", { tx }); // the same guard the UI button calls, repeated server-side
    const l = await tx.listing.create({ data: { ...rest, landDetails, sellerId: actor.id } });
    if (lat !== undefined && lng !== undefined) await setPoint(tx, "Listing", l.id, lat, lng);
    await writeAudit({ actor, action: "listing.create", resourceType: "Listing", resourceId: l.id, req }, tx);
    return l;
  });
}

async function loadOwn(actor: Actor, id: string) {
  const l = await db.listing.findUnique({ where: { id }, include: { images: true } });
  if (!l) throw new AppError("NOT_FOUND");
  await authorize(actor, "listing:manage", { ownerId: l.sellerId });
  return l;
}

export async function updateListing(actor: Actor, id: string, data: z.infer<typeof listingUpdateSchema>, req: Request) {
  const l = await loadOwn(actor, id);
  if (l.status !== "DRAFT" && l.status !== "REJECTED" && l.status !== "PUBLISHED") throw new AppError("INVALID_STATE", { from: l.status });
  await assertLinks(actor, data.propertyId, data.unitId);
  // edits to important fields of a live listing need moderation again (pages.md 3.6)
  const IMPORTANT = ["type", "category", "title", "description", "price", "propertyId", "unitId", "lat", "lng", "zoneId", "area"] as const;
  const reapprove = l.status === "PUBLISHED" && IMPORTANT.some((k) => k in data);
  const { lat, lng, ...rest } = data;
  return db.$transaction(async (tx) => {
    const out = await tx.listing.update({ where: { id }, data: { ...rest, landDetails: rest.landDetails as Prisma.InputJsonValue | undefined, ...(reapprove ? { status: "PENDING" as const } : {}) } });
    if (reapprove) await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "listing.pending", titleKey: "notifications.listingPending", params: { title: l.title }, link: "/admin/listings?status=PENDING" }, tx);
    if (lat !== undefined && lng !== undefined) await setPoint(tx, "Listing", id, lat, lng);
    await writeAudit({ actor, action: "listing.update", resourceType: "Listing", resourceId: id, req }, tx);
    return out;
  });
}

export async function addListingImage(actor: Actor, id: string, input: z.infer<typeof imageSchema>) {
  const l = await loadOwn(actor, id);
  if (l.images.length >= 15) throw new AppError("PLAN_LIMIT_REACHED", { kind: "image", cap: 15 });
  return db.listingImage.create({ data: { listingId: id, ...input } });
}

/** DRAFT/REJECTED → PENDING moderation. The cap is checked again because drafts do not count toward it. */
export async function submitListing(actor: Actor, id: string, req: Request) {
  const l = await loadOwn(actor, id);
  if (l.status !== "DRAFT" && l.status !== "REJECTED") throw new AppError("INVALID_STATE", { from: l.status });
  if (l.images.length === 0) throw new AppError("VALIDATION_ERROR", [{ path: "images", code: "at_least_one_image" }]);
  if (!l.declaration) throw new AppError("VALIDATION_ERROR", [{ path: "declaration", code: "must_accept" }]);
  if (await getSetting("marketplace.requireOwnershipDocs", false)) {
    if ((await db.listingDocument.count({ where: { listingId: id } })) === 0) throw new AppError("VALIDATION_ERROR", [{ path: "documents", code: "ownership_document_required" }]);
  }
  return db.$transaction(async (tx) => {
    await assertEntitlement(actor, "listing", { tx });
    const out = await tx.listing.update({ where: { id }, data: { status: "PENDING", rejectionReason: null } });
    // a second active listing for the same property/unit is flagged for review, not blocked
    const links = [l.unitId ? { unitId: l.unitId } : null, l.propertyId && !l.unitId ? { propertyId: l.propertyId } : null].filter(Boolean) as object[];
    if (links.length && (await tx.listing.count({ where: { id: { not: id }, status: { in: ["PENDING", "PUBLISHED"] }, OR: links } })) > 0
      && !(await tx.listingReport.count({ where: { listingId: id, reporterId: actor.id, status: "OPEN" } }))) {
      await tx.listingReport.create({ data: { listingId: id, reporterId: actor.id, category: "DUPLICATE_AUTO", description: "Another active listing exists for the same property/unit" } });
    }
    await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "listing.pending", titleKey: "notifications.listingPending", params: { title: l.title }, link: "/admin/listings?status=PENDING" }, tx);
    await writeAudit({ actor, action: "listing.submit", resourceType: "Listing", resourceId: id, req }, tx);
    return out;
  });
}

const OWN_FLOW: Record<ListingAction, { from: ListingStatus[]; to: ListingStatus; type?: "RENT" | "SALE" }> = {
  renew: { from: ["EXPIRED"], to: "PUBLISHED" },
  "mark-sold": { from: ["PUBLISHED"], to: "SOLD", type: "SALE" },
  "mark-rented": { from: ["PUBLISHED"], to: "RENTED", type: "RENT" },
  deactivate: { from: ["PUBLISHED", "PENDING"], to: "DRAFT" },
  archive: { from: ["DRAFT", "REJECTED", "PUBLISHED", "SOLD", "RENTED", "EXPIRED", "PENDING"], to: "ARCHIVED" },
};

export async function ownerAction(actor: Actor, id: string, action: ListingAction, req: Request) {
  const l = await loadOwn(actor, id);
  const rule = OWN_FLOW[action];
  if (!rule.from.includes(l.status)) throw new AppError("INVALID_STATE", { from: l.status, action });
  if (rule.type && l.type !== rule.type) throw new AppError("INVALID_STATE", { reason: "wrong_listing_type" });
  return db.$transaction(async (tx) => {
    let expiresAt: Date | undefined;
    if (action === "renew") {
      const ent = await assertEntitlement(actor, "listing", { tx });
      expiresAt = new Date(Date.now() + (ent.limits.listingDurationDays || 30) * 86400_000);
    }
    const out = await tx.listing.update({ where: { id }, data: { status: rule.to, ...(expiresAt ? { expiresAt } : {}) } });
    await writeAudit({ actor, action: `listing.${action}`, resourceType: "Listing", resourceId: id, before: { status: l.status }, after: { status: rule.to }, req }, tx);
    return out;
  });
}

export async function myListings(actor: Actor, q: z.infer<typeof myListingsQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "listing:manage", { ownerId: actor.id });
  const rows = await db.listing.findMany({ where: { sellerId: actor.id, status: q.status }, include: { images: { take: 1, orderBy: { order: "asc" } } }, ...pageArgs(page) });
  return pageResult(rows, page.limit);
}

export async function addListingDocument(actor: Actor, id: string, input: z.infer<typeof listingDocSchema>) {
  const l = await loadOwn(actor, id);
  if (input.storageKey.split("/")[0] !== "LISTING_DOC" || input.storageKey.split("/")[1] !== actor.id) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  if ((await db.listingDocument.count({ where: { listingId: l.id } })) >= 10) throw new AppError("PLAN_LIMIT_REACHED", { kind: "document", cap: 10 });
  return db.listingDocument.create({ data: { listingId: id, ...input } });
}
