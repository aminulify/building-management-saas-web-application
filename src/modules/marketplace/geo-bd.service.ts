import { AppError } from "@/lib/errors";

/**
 * Bangladesh administrative areas from the free open API (https://bdapis.pro.bd/geo/v2.0/).
 * The browser asks OUR server (no CORS or rate-limit problems), answers are cached for a day, and if the API is down
 * the last good answer is served instead of an error.
 */
const BASE = "https://bdapis.pro.bd/geo/v2.0";
const TTL_MS = 24 * 3600_000;

export type GeoLevel = "divisions" | "districts" | "upazilas" | "unions";
export interface GeoItem { id: string; name: string; bnName: string }

const PATH: Record<GeoLevel, (parent?: string) => string> = {
  divisions: () => "divisions",
  districts: (p) => `districts/${p}`,
  upazilas: (p) => `upazilas/${p}`,
  unions: (p) => `unions/${p}`,
};

const cache = new Map<string, { at: number; data: GeoItem[] }>();

export async function bdGeo(level: GeoLevel, parent?: string): Promise<GeoItem[]> {
  if (level !== "divisions" && !parent) throw new AppError("VALIDATION_ERROR", [{ path: "parent", code: "required" }]);
  const key = `${level}:${parent ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const res = await fetch(`${BASE}/${PATH[level](parent)}`, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`upstream_${res.status}`);
    const json = (await res.json()) as { success?: boolean; data?: { id: string; name: string; bn_name?: string }[] };
    if (!json.success || !Array.isArray(json.data)) throw new Error("upstream_shape");
    const data = json.data.map((d) => ({ id: String(d.id), name: String(d.name).trim(), bnName: String(d.bn_name ?? d.name).trim() })).sort((a, b) => a.name.localeCompare(b.name));
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    if (hit) return hit.data; // stale beats nothing
    throw new AppError("INTERNAL", { reason: "geo_api_unavailable" });
  }
}
