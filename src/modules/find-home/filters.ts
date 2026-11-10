import type { AiResponse, Filters, GeoItem } from "./types";

export const EMPTY_FILTERS: Filters = {
  mode: "RENT", q: "", zoneId: "", division: null, district: null, upazila: null, union: null, minPrice: "", maxPrice: "", category: "", landType: "",
  beds: [], nearby: [], amenities: [], furnishing: "", sort: "newest", saved: false,
};

export const PAGE_SIZE = 9;

/** Digits only (Bangla digits are converted), so "২৫,০০০" or "25 000" both work in the price boxes. */
export function cleanAmount(v: string): string {
  return v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "").slice(0, 10);
}

/** Query string for GET /listings. `cursor` is the "Load more" position. */
export function toQuery(f: Filters, cursor?: string | null, limit: number = PAGE_SIZE): string {
  const p = new URLSearchParams({ type: f.mode, limit: String(limit), sort: f.sort });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.zoneId) p.set("zoneId", f.zoneId);
  if (f.division) p.set("division", f.division.name);
  if (f.district) p.set("district", f.district.name);
  if (f.upazila) p.set("upazila", f.upazila.name);
  if (f.union) p.set("unionName", f.union.name);
  if (f.minPrice) p.set("minPrice", f.minPrice);
  if (f.maxPrice) p.set("maxPrice", f.maxPrice);
  if (f.category === "APARTMENT") p.set("categories", "FLAT,APARTMENT");
  else if (f.category === "BUILDING") p.set("categories", "BUILDING");
  else if (f.category) p.set("categories", f.category);
  if (f.landType && f.category === "LAND") p.set("landType", f.landType);
  if (f.beds.length && f.category !== "LAND") p.set("bedroomList", [...f.beds].sort((a, b) => a - b).join(","));
  if (f.nearby.length) p.set("nearby", f.nearby.join(","));
  if (f.amenities.length) p.set("amenities", f.amenities.join(","));
  if (f.furnishing) p.set("furnishing", f.furnishing);
  if (f.saved) p.set("saved", "1");
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

/** True when the price boxes hold a range whose minimum is above its maximum. */
export const priceRangeInvalid = (f: Pick<Filters, "minPrice" | "maxPrice">) => !!f.minPrice && !!f.maxPrice && Number(f.minPrice) > Number(f.maxPrice);

/** How many things (besides mode and sort) are narrowing the list: drives the "Clear all" button. */
export function activeCount(f: Filters): number {
  return [f.q.trim(), f.zoneId, f.division, f.minPrice, f.maxPrice, f.category, f.landType, f.furnishing, f.saved].filter(Boolean).length + (f.district ? 1 : 0) + (f.upazila ? 1 : 0) + (f.union ? 1 : 0) + f.beds.length + f.nearby.length + f.amenities.length;
}

export const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Place ids are only known to the geo API, so the AI's place NAMES are turned back into ids to fill the dropdowns. */
export async function resolvePlaces(
  names: { division?: string; district?: string; upazila?: string; unionName?: string },
  load: (level: "divisions" | "districts" | "upazilas" | "unions", parent?: string) => Promise<GeoItem[]>,
): Promise<Pick<Filters, "division" | "district" | "upazila" | "union">> {
  const out: Pick<Filters, "division" | "district" | "upazila" | "union"> = { division: null, district: null, upazila: null, union: null };
  const find = (list: GeoItem[], name?: string) => (name ? list.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null : null);
  try {
    if (!names.division) return out;
    out.division = find(await load("divisions"), names.division);
    if (out.division && names.district) out.district = find(await load("districts", out.division.id), names.district);
    if (out.district && names.upazila) out.upazila = find(await load("upazilas", out.district.id), names.upazila);
    if (out.upazila && names.unionName) out.union = find(await load("unions", out.upazila.id), names.unionName);
  } catch { /* the geo API is down: the other filters still apply */ }
  return out;
}

/** Turns the assistant's understanding into filter state (places are resolved by the caller). */
export function filtersFromAi(ai: AiResponse["filters"], base: Filters): Omit<Filters, "division" | "district" | "upazila" | "union"> {
  const cats = ai.categories ?? [];
  const category: Filters["category"] = cats.includes("LAND") ? "LAND" : cats.includes("DUPLEX") ? "DUPLEX" : cats.includes("STUDIO") ? "STUDIO" : cats.includes("COMMERCIAL") ? "COMMERCIAL" : cats.includes("FLAT") || cats.includes("APARTMENT") ? "APARTMENT" : "";
  return {
    ...base,
    mode: ai.type, category, landType: ai.landType ?? "",
    minPrice: ai.minPrice !== undefined ? String(ai.minPrice) : "", maxPrice: ai.maxPrice !== undefined ? String(ai.maxPrice) : "",
    beds: ai.bedroomList ?? [], nearby: ai.nearby, amenities: ai.amenities, furnishing: ai.furnishing ?? "",
    sort: ai.sort === "price_asc" || ai.sort === "price_desc" ? ai.sort : "newest", saved: false,
  };
}
