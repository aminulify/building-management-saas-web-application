import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import { pageResult } from "@/lib/api/common";
import { getSetting } from "@/modules/admin/settings.service";
import type { searchQuery } from "./schema";

const publicSelect = {
  id: true, type: true, category: true, title: true, price: true, negotiable: true, area: true, areaUnit: true,
  bedrooms: true, bathrooms: true, floor: true, furnishing: true, condition: true, amenities: true, isFeatured: true, createdAt: true,
  division: true, district: true, upazila: true, unionName: true, postalCode: true, fullAddress: true, balconies: true, sellerId: true,
  zone: { select: { id: true, nameBn: true, nameEn: true } },
  images: { take: 5, orderBy: { order: "asc" as const }, select: { storageKey: true } },
  seller: { select: { fullName: true, avatarKey: true, verificationStatus: true, ownerCode: true } },
  _count: { select: { images: true } },
} satisfies Prisma.ListingSelect;

/** A filter on one amenity also accepts its sibling ("School / College", "Playground / Park"). */
const AMENITY_ALIASES: Record<string, string[]> = { SCHOOL: ["SCHOOL", "COLLEGE"], PARK: ["PARK", "PLAYGROUND"], SECURITY: ["SECURITY", "SECURITY_GUARD"] };

const ci = (v: string) => ({ equals: v, mode: "insensitive" as const });
const has = (v: string) => ({ contains: v, mode: "insensitive" as const });

/** Search box: title, description, address, place names, postal code and the seller's owner ID or name. */
const textSearch = (q: string): Prisma.ListingWhereInput[] => [
  { title: has(q) }, { description: has(q) }, { fullAddress: has(q) }, { division: has(q) }, { district: has(q) }, { upazila: has(q) }, { unionName: has(q) }, { postalCode: has(q) },
  { seller: { ownerCode: has(q) } }, { seller: { fullName: has(q) } },
];

/** "Keraniganj, Dhaka - 1311" */
export const locationLabel = (l: { unionName?: string | null; upazila?: string | null; district?: string | null; postalCode?: string | null }) =>
  [l.unionName, l.upazila, l.district].filter((p, i, all): p is string => !!p && p !== all[i - 1]).join(", ") + (l.postalCode ? ` - ${l.postalCode}` : "");

/** Zone-based rental/sale search: division → district → upazila → zone, price, amenities, optional radius (PostGIS). */
/** Min/max and geography-chain checks from pages.md 3.2 (district must match division, etc.). */
async function validateFilters(q: z.infer<typeof searchQuery>) {
  const bad = (path: string, code: string) => new AppError("VALIDATION_ERROR", [{ path, code }]);
  if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) throw bad("maxPrice", "min_exceeds_max");
  if (q.minArea !== undefined && q.maxArea !== undefined && q.minArea > q.maxArea) throw bad("maxArea", "min_exceeds_max");
  const geo = [q.lat, q.lng, q.radiusKm].filter((v) => v !== undefined).length;
  if (geo !== 0 && geo !== 3) throw bad("radiusKm", "lat_lng_radius_together"); // a point without a radius (or the reverse) is meaningless
  if (q.districtId && q.divisionId && !(await db.district.count({ where: { id: q.districtId, divisionId: q.divisionId } }))) throw bad("districtId", "not_in_division");
  if (q.upazilaId && q.districtId && !(await db.upazila.count({ where: { id: q.upazilaId, districtId: q.districtId } }))) throw bad("upazilaId", "not_in_district");
  if (q.zoneId && q.upazilaId && !(await db.zone.count({ where: { id: q.zoneId, upazilaId: q.upazilaId } }))) throw bad("zoneId", "not_in_upazila");
}

export async function search(q: z.infer<typeof searchQuery>, actor: Actor | null = null) {
  await validateFilters(q);
  const nearbyM = q.nearbyM ?? (await getSetting("marketplace.nearbyRangeM", 1000));
  // every nearby facility and every ticked amenity must hold (an amenity also accepts its sibling, see AMENITY_ALIASES)
  const and: Prisma.ListingWhereInput[] = [
    ...(q.nearby ?? []).map((t) => ({ distances: { some: { facilityType: t, distanceM: { lte: nearbyM } } } })),
    ...(q.amenities ?? []).map((a) => ({ OR: (AMENITY_ALIASES[a] ?? [a]).map((x) => ({ amenities: { has: x } })) })),
  ];
  const where: Prisma.ListingWhereInput = {
    status: "PUBLISHED", type: q.type, category: q.categories?.length ? { in: q.categories } : q.category, furnishing: q.furnishing,
    ...(q.division ? { division: ci(q.division) } : {}),
    ...(q.district ? { district: ci(q.district) } : {}),
    ...(q.upazila ? { upazila: ci(q.upazila) } : {}),
    ...(q.unionName ? { unionName: ci(q.unionName) } : {}),
    ...(q.saved && actor ? { favorites: { some: { userId: actor.id } } } : {}),
    ...(q.divisionId ? { zone: { upazila: { district: { divisionId: q.divisionId } } } } : {}),
    ...(q.districtId ? { zone: { upazila: { districtId: q.districtId } } } : {}),
    ...(q.upazilaId ? { zone: { upazilaId: q.upazilaId } } : {}),
    ...(q.zoneId ? { zoneId: q.zoneId } : {}),
    ...(q.minPrice !== undefined || q.maxPrice !== undefined ? { price: { gte: q.minPrice, lte: q.maxPrice } } : {}),
    ...(q.bedroomList?.length ? { bedrooms: { in: q.bedroomList } } : q.bedrooms !== undefined ? { bedrooms: { gte: q.bedrooms } } : {}),
    ...(q.bathrooms !== undefined ? { bathrooms: { gte: q.bathrooms } } : {}),
    ...(q.floor !== undefined ? { floor: q.floor } : {}),
    ...(q.landType ? { landDetails: { path: ["landType"], equals: q.landType } } : {}),
    ...(q.areaUnit ? { areaUnit: q.areaUnit } : {}),
    ...(q.minArea !== undefined || q.maxArea !== undefined ? { area: { gte: q.minArea, lte: q.maxArea } } : {}),
    // nearby facilities use pre-computed distances from verified coordinates, never owner-typed text
    ...(and.length ? { AND: and } : {}),
    ...(q.q ? { OR: textSearch(q.q) } : {}),
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

  const [rows, total] = await Promise.all([
    db.listing.findMany({ where, orderBy, take: q.limit + 1, select: publicSelect, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
    db.listing.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const saved = actor ? new Set((await db.favorite.findMany({ where: { userId: actor.id, listingId: { in: page.items.map((i) => i.id) } }, select: { listingId: true } })).map((f) => f.listingId)) : new Set<string>();
  const urls = await signStorageKeys([...page.items.flatMap((l) => l.images.map((i) => i.storageKey)), ...page.items.flatMap((l) => (l.seller.avatarKey ? [l.seller.avatarKey] : []))], 3600);
  const items = page.items.map(({ _count, seller, ...l }) => {
    const gallery = l.images.flatMap((i) => (urls.get(i.storageKey) ? [urls.get(i.storageKey)!] : []));
    return {
      ...l, photos: _count.images, locationLabel: locationLabel(l), isFavorite: saved.has(l.id), isOwn: !!actor && actor.id === l.sellerId,
      coverUrl: gallery[0] ?? null, gallery,
      seller: { fullName: seller.fullName, ownerCode: seller.ownerCode, verified: seller.verificationStatus === "VERIFIED", avatarUrl: (seller.avatarKey && urls.get(seller.avatarKey)) || null },
    };
  });
  return { items, nextCursor: page.nextCursor, total };
}

/** Published → anyone. Otherwise only the seller, Super Admin, or Gov Admin (read). Seller phone is never exposed. */
export async function getListing(actor: Actor | null, id: string) {
  const l = await db.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } }, distances: true,
      zone: { include: { upazila: { include: { district: { include: { division: true } } } } } },
      seller: { select: { id: true, fullName: true, username: true, verificationStatus: true, avatarKey: true, ownerCode: true } },
    },
  });
  if (!l) throw new AppError("NOT_FOUND");
  const privileged = !!actor && (actor.id === l.sellerId || actor.role === "SUPER_ADMIN" || actor.role === "GOV_ADMIN");
  if (l.status !== "PUBLISHED" && !privileged) throw new AppError("NOT_FOUND");

  const [pt, fav, photos, avatar] = await Promise.all([
    db.$queryRaw<{ lat: number | null; lng: number | null }[]>`SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "Listing" WHERE id = ${id}::uuid`,
    actor ? db.favorite.count({ where: { userId: actor.id, listingId: id } }) : 0,
    signStorageKeys(l.images.map((i) => i.storageKey), 3600).then((m) => l.images.map((i) => m.get(i.storageKey) ?? null)),
    l.seller.avatarKey ? signStorageKey(l.seller.avatarKey, 3600).then((r) => r.url).catch(() => null) : null,
  ]);
  const { avatarKey: _a, verificationStatus, ...seller } = l.seller;
  return {
    ...l, seller: { ...seller, verified: verificationStatus === "VERIFIED", nidStatus: verificationStatus, avatarUrl: avatar },
    lat: pt[0]?.lat ?? null, lng: pt[0]?.lng ?? null, isFavorite: fav > 0, isOwn: !!actor && actor.id === l.sellerId,
    photoUrls: photos.filter((u): u is string => !!u), locationLabel: locationLabel(l),
    /** id + signed URL per photo, in order: the edit form needs the ids to remove a photo */
    photoList: l.images.flatMap((i, k) => (photos[k] ? [{ id: i.id, url: photos[k]! }] : [])),
  };
}

export async function recordView(id: string, ip: string) {
  rateLimit(`view:${ip}:${id}`, 1, 60_000);
  const day = new Date(new Date().toISOString().slice(0, 10));
  const exists = await db.listing.count({ where: { id, status: "PUBLISHED" } });
  if (!exists) throw new AppError("NOT_FOUND");
  await db.listingStatDaily.upsert({ where: { listingId_date: { listingId: id, date: day } }, update: { views: { increment: 1 } }, create: { listingId: id, date: day, views: 1 } });
  return { counted: true };
}
