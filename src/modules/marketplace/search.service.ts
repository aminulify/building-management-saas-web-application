import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { pageResult } from "@/lib/api/common";
import { getSetting } from "@/modules/admin/settings.service";
import type { searchQuery } from "./schema";

const publicSelect = {
  id: true, type: true, category: true, title: true, price: true, negotiable: true, area: true, areaUnit: true,
  bedrooms: true, bathrooms: true, floor: true, furnishing: true, amenities: true, isFeatured: true, createdAt: true,
  zone: { select: { id: true, nameBn: true, nameEn: true } },
  images: { take: 1, orderBy: { order: "asc" as const }, select: { storageKey: true } },
} satisfies Prisma.ListingSelect;

/** Zone-based rental/sale search: division → district → upazila → zone, price, amenities, optional radius (PostGIS). */
/** Min/max and geography-chain checks from pages.md 3.2 (district must match division, etc.). */
async function validateFilters(q: z.infer<typeof searchQuery>) {
  const bad = (path: string, code: string) => new AppError("VALIDATION_ERROR", [{ path, code }]);
  if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) throw bad("maxPrice", "min_exceeds_max");
  if (q.minArea !== undefined && q.maxArea !== undefined && q.minArea > q.maxArea) throw bad("maxArea", "min_exceeds_max");
  if ((q.lat === undefined) !== (q.lng === undefined) || (q.radiusKm !== undefined && q.lat === undefined)) throw bad("lat", "lat_lng_radius_together");
  if (q.districtId && q.divisionId && !(await db.district.count({ where: { id: q.districtId, divisionId: q.divisionId } }))) throw bad("districtId", "not_in_division");
  if (q.upazilaId && q.districtId && !(await db.upazila.count({ where: { id: q.upazilaId, districtId: q.districtId } }))) throw bad("upazilaId", "not_in_district");
  if (q.zoneId && q.upazilaId && !(await db.zone.count({ where: { id: q.zoneId, upazilaId: q.upazilaId } }))) throw bad("zoneId", "not_in_upazila");
}

export async function search(q: z.infer<typeof searchQuery>) {
  await validateFilters(q);
  const nearbyM = q.nearbyM ?? (await getSetting("marketplace.nearbyRangeM", 1000));
  const where: Prisma.ListingWhereInput = {
    status: "PUBLISHED", type: q.type, category: q.category, furnishing: q.furnishing,
    ...(q.divisionId ? { zone: { upazila: { district: { divisionId: q.divisionId } } } } : {}),
    ...(q.districtId ? { zone: { upazila: { districtId: q.districtId } } } : {}),
    ...(q.upazilaId ? { zone: { upazilaId: q.upazilaId } } : {}),
    ...(q.zoneId ? { zoneId: q.zoneId } : {}),
    ...(q.minPrice !== undefined || q.maxPrice !== undefined ? { price: { gte: q.minPrice, lte: q.maxPrice } } : {}),
    ...(q.bedrooms !== undefined ? { bedrooms: { gte: q.bedrooms } } : {}),
    ...(q.bathrooms !== undefined ? { bathrooms: { gte: q.bathrooms } } : {}),
    ...(q.floor !== undefined ? { floor: q.floor } : {}),
    ...(q.minArea !== undefined || q.maxArea !== undefined ? { area: { gte: q.minArea, lte: q.maxArea } } : {}),
    // nearby facilities use pre-computed distances from verified coordinates, never owner-typed text
    ...(q.nearby?.length ? { AND: q.nearby.map((t) => ({ distances: { some: { facilityType: t, distanceM: { lte: nearbyM } } } })) } : {}),
    ...(q.amenities?.length ? { amenities: { hasEvery: q.amenities } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] } : {}),
  };

  if (q.lat !== undefined && q.lng !== undefined && q.radiusKm !== undefined) {
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Listing"
      WHERE status = 'PUBLISHED' AND location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography, ${q.radiusKm * 1000})
      LIMIT 2000`;
    where.id = { in: ids.map((r) => r.id) };
  }

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    q.sort === "price_asc" ? [{ isFeatured: "desc" }, { price: "asc" }, { id: "desc" }]
    : q.sort === "price_desc" ? [{ isFeatured: "desc" }, { price: "desc" }, { id: "desc" }]
    : q.sort === "popularity" ? [{ isFeatured: "desc" }, { favorites: { _count: "desc" } }, { id: "desc" }]
    : q.sort === "area_desc" ? [{ isFeatured: "desc" }, { area: { sort: "desc", nulls: "last" } }, { id: "desc" }]
    : [{ isFeatured: "desc" }, { id: "desc" }];

  const rows = await db.listing.findMany({
    where, orderBy, take: q.limit + 1, select: publicSelect,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  return pageResult(rows, q.limit);
}

/** Published → anyone. Otherwise only the seller, Super Admin, or Gov Admin (read). Seller phone is never exposed. */
export async function getListing(actor: Actor | null, id: string) {
  const l = await db.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } }, distances: true,
      zone: { include: { upazila: { include: { district: { include: { division: true } } } } } },
      seller: { select: { id: true, fullName: true, username: true } },
    },
  });
  if (!l) throw new AppError("NOT_FOUND");
  const privileged = !!actor && (actor.id === l.sellerId || actor.role === "SUPER_ADMIN" || actor.role === "GOV_ADMIN");
  if (l.status !== "PUBLISHED" && !privileged) throw new AppError("NOT_FOUND");
  return l;
}

export async function recordView(id: string, ip: string) {
  rateLimit(`view:${ip}:${id}`, 1, 60_000);
  const day = new Date(new Date().toISOString().slice(0, 10));
  const exists = await db.listing.count({ where: { id, status: "PUBLISHED" } });
  if (!exists) throw new AppError("NOT_FOUND");
  await db.listingStatDaily.upsert({ where: { listingId_date: { listingId: id, date: day } }, update: { views: { increment: 1 } }, create: { listingId: id, date: day, views: 1 } });
  return { counted: true };
}
