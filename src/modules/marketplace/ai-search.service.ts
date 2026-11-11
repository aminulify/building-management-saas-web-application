import type { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKeys } from "@/modules/uploads/service";
import { findPlaces, parseQuery, type Amenity, type NearbyType } from "./ai-parser";
import type { aiSearchSchema } from "./schema";

/** What each part of the sentence is worth when ranking (location and price matter most). */
const W = { location: 3, bedrooms: 3, price: 3, category: 2, nearby: 2, amenity: 1.5, furnishing: 1, bathrooms: 1, profile: 1.5 } as const;
const NEARBY_M = 1000;

export interface AiFilters {
  type: "RENT" | "SALE";
  division?: string; district?: string; upazila?: string; unionName?: string;
  minPrice?: number; maxPrice?: number;
  bedroomList?: number[];
  categories?: string[];
  landType?: string;
  area?: number; areaUnit?: string;
  nearby: NearbyType[];
  amenities: Amenity[];
  furnishing?: string;
  sort?: string;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
const mode = <T,>(xs: T[]) => { const c = new Map<T, number>(); for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

/** Preferences inferred from what this person saved: typical rent, bedrooms and area. Nothing is stored. */
async function profileOf(actor: Actor | null) {
  if (!actor) return null;
  const favs = await db.favorite.findMany({
    where: { userId: actor.id, listing: { status: "PUBLISHED" } }, orderBy: { id: "desc" }, take: 20,
    select: { listing: { select: { price: true, bedrooms: true, upazila: true, district: true, type: true } } },
  });
  if (favs.length < 2) return null;
  const ls = favs.map((f) => f.listing);
  return {
    saved: ls.length,
    medianPrice: median(ls.map((l) => Number(l.price))),
    bedrooms: mode(ls.map((l) => l.bedrooms).filter((b): b is number => b !== null)),
    area: mode(ls.map((l) => l.upazila).filter((u): u is string => !!u)),
  };
}

export async function aiSearch(actor: Actor | null, input: z.infer<typeof aiSearchSchema>, req: Request) {
  rateLimit(`ai:${actor?.id ?? clientIp(req)}`, 30, 60_000);
  const p = parseQuery(input.query);
  // the page decides rent or sale; a sentence only decides it when the page did not say
  const type = input.type ?? p.type ?? "RENT";

  // the places that really exist in the data
  const placeRows = await db.listing.findMany({ where: { status: "PUBLISHED" }, select: { division: true, district: true, upazila: true, unionName: true }, orderBy: { id: "desc" }, take: 600 });
  const uniq = (pick: (r: (typeof placeRows)[number]) => string | null) => [...new Set(placeRows.map(pick).filter((v): v is string => !!v))];
  const divisions = uniq((r) => r.division), districts = uniq((r) => r.district), upazilas = uniq((r) => r.upazila), unions = uniq((r) => r.unionName);
  const found = findPlaces(input.query, { division: divisions, district: districts, upazila: upazilas, unionName: unions });
  // a town named alone ("Keraniganj") also tells us its district and division, so the page can fill every dropdown
  const row = placeRows.find((r) => (found.unionName && r.unionName === found.unionName) || (found.upazila && r.upazila === found.upazila) || (found.district && r.district === found.district));
  const place = { ...found, district: found.district ?? row?.district ?? undefined, division: found.division ?? row?.division ?? undefined };

  const profile = await profileOf(actor);
  const filters: AiFilters = {
    type, ...place,
    minPrice: p.minPrice, maxPrice: p.maxPrice,
    bedroomList: p.bedrooms !== undefined ? [p.bedrooms] : undefined,
    categories: p.categories, landType: p.landType, area: p.area, areaUnit: p.areaUnit, nearby: p.nearby, amenities: p.amenities, furnishing: p.furnishing, sort: p.sort,
  };

  const candidates = await db.listing.findMany({
    where: { status: "PUBLISHED", type },
    orderBy: { id: "desc" }, take: 400,
    select: {
      id: true, isFeatured: true, title: true, price: true, category: true, bedrooms: true, bathrooms: true, area: true, areaUnit: true, landDetails: true, furnishing: true, amenities: true, createdAt: true,
      division: true, district: true, upazila: true, unionName: true, postalCode: true,
      distances: { select: { facilityType: true, distanceM: true } },
      images: { take: 1, orderBy: { order: "asc" }, select: { storageKey: true } },
    },
  });

  const lc = (v: string | null | undefined) => (v ?? "").toLowerCase();
  const wantedDistrict = place.district ?? candidates.find((c) => (place.unionName && c.unionName === place.unionName) || (place.upazila && c.upazila === place.upazila))?.district ?? null;
  const scored = candidates.map((l) => {
    let earned = 0, total = 0;
    const matched: string[] = [], missing: string[] = [];
    const grade = (key: string, weight: number, ok: boolean, partial = 0) => {
      total += weight;
      if (ok) { earned += weight; matched.push(key); } else if (partial > 0) { earned += weight * partial; matched.push(`${key}~`); } else missing.push(key);
    };

    const wantsPlace = place.unionName || place.upazila || place.district || place.division;
    if (wantsPlace) {
      const exact = place.unionName ? lc(l.unionName) === lc(place.unionName) : place.upazila ? lc(l.upazila) === lc(place.upazila) : place.district ? lc(l.district) === lc(place.district) : lc(l.division) === lc(place.division);
      // same district as the wanted upazila/union = a near miss worth part of the points
      const sameDistrict = !exact && !!wantedDistrict && lc(l.district) === lc(wantedDistrict);
      grade("location", W.location, exact, sameDistrict ? 0.4 : 0);
    }
    if (p.bedrooms !== undefined) grade("bedrooms", W.bedrooms, l.bedrooms === p.bedrooms, l.bedrooms !== null && Math.abs(l.bedrooms - p.bedrooms) === 1 ? 0.35 : 0);
    if (p.bathrooms !== undefined) grade("bathrooms", W.bathrooms, (l.bathrooms ?? 0) >= p.bathrooms);
    if (p.maxPrice !== undefined || p.minPrice !== undefined) {
      const price = Number(l.price);
      const okMax = p.maxPrice === undefined || price <= p.maxPrice;
      const okMin = p.minPrice === undefined || price >= p.minPrice;
      const slightlyOver = p.maxPrice !== undefined && price > p.maxPrice && price <= p.maxPrice * 1.15 ? 0.45 : 0;
      grade("price", W.price, okMax && okMin, slightlyOver);
    }
    if (p.categories?.length) grade("category", W.category, p.categories.includes(l.category));
    if (p.landType) grade("land_type", W.category, ((l.landDetails as { landType?: string } | null)?.landType ?? "") === p.landType);
    if (p.area !== undefined && p.areaUnit) {
      const a = l.area ? Number(l.area) : 0;
      const same = l.areaUnit === p.areaUnit;
      grade("area", W.category, same && a >= p.area * 0.8 && a <= p.area * 1.25, same && a >= p.area * 0.6 && a <= p.area * 1.6 ? 0.4 : 0);
    }
    for (const n of p.nearby) grade(`near_${n.toLowerCase()}`, W.nearby, l.distances.some((d) => d.facilityType === n && d.distanceM <= NEARBY_M), l.distances.some((d) => d.facilityType === n && d.distanceM <= NEARBY_M * 2) ? 0.4 : 0);
    for (const a of p.amenities) grade(a.toLowerCase(), W.amenity, l.amenities.includes(a));
    if (p.furnishing) grade("furnishing", W.furnishing, l.furnishing === p.furnishing);

    // soft, personal nudges from the person's saved homes (never hide a result, only reorder)
    let profileBonus = 0;
    if (profile) {
      if (p.maxPrice === undefined && p.minPrice === undefined && profile.medianPrice) { total += W.profile; const r = Number(l.price) / profile.medianPrice; if (r >= 0.75 && r <= 1.25) { earned += W.profile; profileBonus++; } }
      if (!wantsPlace && profile.area) { total += 1; if (lc(l.upazila) === lc(profile.area)) { earned += 1; profileBonus++; } }
    }
    if (total === 0) { total = 1; earned = 0.5; } // a sentence with no criteria: every home is a neutral 50%
    return { l, percent: Math.round((earned / total) * 100), matched, missing, profileBonus };
  });

  const ranked = scored
    .filter((s) => s.percent >= 25)
    .sort((a, b) => Number(b.l.isFeatured) - Number(a.l.isFeatured) || b.percent - a.percent || b.profileBonus - a.profileBonus || (p.sort === "price_asc" ? Number(a.l.price) - Number(b.l.price) : p.sort === "price_desc" ? Number(b.l.price) - Number(a.l.price) : +b.l.createdAt - +a.l.createdAt))
    .slice(0, 8);

  const covers = await signStorageKeys(ranked.flatMap(({ l }) => (l.images[0] ? [l.images[0].storageKey] : [])), 3600);
  const results = ranked.map(({ l, percent, matched, missing }) => ({
    id: l.id, title: l.title, price: l.price.toFixed(2), category: l.category, bedrooms: l.bedrooms, bathrooms: l.bathrooms, area: l.area ? Number(l.area) : null,
    locationLabel: [l.unionName, l.upazila, l.district].filter(Boolean).join(", ") + (l.postalCode ? ` - ${l.postalCode}` : ""),
    coverUrl: (l.images[0] && covers.get(l.images[0].storageKey)) || null,
    matchPercent: percent, matched, missing, isFeatured: l.isFeatured,
  }));

  const understood = [p.bedrooms !== undefined, p.maxPrice !== undefined || p.minPrice !== undefined, p.nearby.length > 0, p.amenities.length > 0, !!p.categories, !!p.furnishing, !!p.landType, p.area !== undefined, !!(place.division || place.district || place.upazila || place.unionName)].filter(Boolean).length;
  return {
    query: input.query,
    understood,
    filters,
    profile: profile ? { saved: profile.saved, medianPrice: profile.medianPrice, bedrooms: profile.bedrooms, area: profile.area } : null,
    results,
    totalCandidates: candidates.length,
  };
}
