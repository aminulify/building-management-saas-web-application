import type { Prisma } from "@prisma/client";

export type FeedSort = "newest" | "price_asc" | "price_desc" | "popularity" | "area_desc";

/**
 * The order of every public Marketplace / Find Home result list: listings the Super Admin featured come FIRST, whatever the
 * search words, place filters or chosen sort are; the chosen sort only orders inside each group. The id is the last tie-break,
 * so "load more" pages never repeat or skip a listing.
 */
export function feedOrder(sort: FeedSort): Prisma.ListingOrderByWithRelationInput[] {
  const inner: Prisma.ListingOrderByWithRelationInput[] =
    sort === "price_asc" ? [{ price: "asc" }]
    : sort === "price_desc" ? [{ price: "desc" }]
    : sort === "popularity" ? [{ favorites: { _count: "desc" } }]
    : sort === "area_desc" ? [{ area: { sort: "desc", nulls: "last" } }]
    : [];
  return [{ isFeatured: "desc" }, ...inner, { id: "desc" }];
}
