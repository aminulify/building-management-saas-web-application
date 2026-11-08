import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import { getEntitlement } from "@/lib/authz/entitlement";
import type { Actor } from "@/lib/auth/require-actor";

/** Free account (property seeker): favourites, saved searches, own listings and what an upgrade would unlock. */
export async function userDashboard(actor: Actor) {
  requireRole(actor, "GENERAL_USER");
  const [favorites, savedSearches, listings, seller, openComplaints, unread, pending, inquiries] = await Promise.all([
    db.favorite.count({ where: { userId: actor.id } }),
    db.savedSearch.count({ where: { userId: actor.id } }),
    db.listing.groupBy({ by: ["status"], where: { sellerId: actor.id }, _count: { _all: true } }),
    getEntitlement(actor.id, "SELLER"),
    db.complaint.count({ where: { reporterId: actor.id, status: { in: ["OPEN", "IN_REVIEW", "REOPENED"] } } }),
    db.notification.count({ where: { userId: actor.id, readAt: null, archivedAt: null } }),
    db.upgradeRequest.findFirst({ where: { userId: actor.id, status: "PENDING" }, select: { id: true, createdAt: true } }),
    db.conversation.count({ where: { type: "LISTING_INQUIRY", participants: { some: { userId: actor.id } } } }),
  ]);
  return {
    favorites, savedSearches, openComplaints, unreadNotifications: unread, inquiries,
    listings: Object.fromEntries(listings.map((l) => [l.status, l._count._all])),
    sellerPlan: { status: seller.status, limits: seller.limits, usage: seller.usage },
    canCreateListing: seller.status === "ACTIVE",
    pendingUpgrade: pending,
  };
}
