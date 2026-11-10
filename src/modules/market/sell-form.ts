import { z } from "zod";
import type { AreaUnit, GeoItem, HomeDetails, LandType } from "../find-home/types";

/** What a seller can list (the dropdown of the form). Duplex and studio are only offered when editing an old listing of that kind. */
export const CATEGORY_OPTIONS = ["BUILDING", "APARTMENT", "LAND", "COMMERCIAL"] as const;
/** The seven facilities of the amenity checkboxes. "School" also covers colleges, "Park" also playgrounds. */
export const AMENITY_OPTIONS = ["SECURITY", "PARKING", "MOSQUE", "SCHOOL", "UNIVERSITY", "HIGHWAY", "PARK"] as const;
export const CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR"] as const;
export const FURNISHINGS = ["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"] as const;
export const LAND_KINDS: Exclude<LandType, "">[] = ["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL"];
export const AREA_UNITS: AreaUnit[] = ["SQFT", "KATHA", "DECIMAL", "BIGHA"];
export const STEPS = ["basics", "details", "location", "finish"] as const;
export type StepKey = (typeof STEPS)[number];

export const MAX_PHOTOS = 10;
export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The form keeps everything as text, exactly like the inputs; `buildPayload` converts it for the API. */
export interface SellValues {
  mode: "SALE" | "RENT";
  category: string;
  title: string;
  description: string;
  price: string;
  negotiable: boolean;
  condition: string;
  area: string;
  areaUnit: AreaUnit;
  bedrooms: string;
  bathrooms: string;
  balconies: string;
  floor: string;
  totalFloors: string;
  furnishing: string;
  landType: string;
  roadWidthFt: string;
  plotNo: string;
  mouza: string;
  zoneId: string;
  division: GeoItem | null;
  district: GeoItem | null;
  upazila: GeoItem | null;
  union: GeoItem | null;
  postalCode: string;
  fullAddress: string;
  lat: string;
  lng: string;
  amenities: string[];
  declaration: boolean;
}

export const isLand = (v: Pick<SellValues, "category">) => v.category === "LAND";

export const emptySell = (category = "APARTMENT"): SellValues => ({
  mode: "SALE", category, title: "", description: "", price: "", negotiable: false, condition: "",
  area: "", areaUnit: category === "LAND" ? "KATHA" : "SQFT", bedrooms: "", bathrooms: "", balconies: "", floor: "", totalFloors: "", furnishing: "",
  landType: "", roadWidthFt: "", plotNo: "", mouza: "", zoneId: "",
  division: null, district: null, upazila: null, union: null, postalCode: "", fullAddress: "", lat: "", lng: "", amenities: [], declaration: false,
});

/** Fill the form from a saved listing (edit). Place ids are resolved by the caller. */
export function valuesFromListing(l: HomeDetails): SellValues {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  return {
    ...emptySell(l.category), mode: l.type, category: l.category, title: l.title, description: l.description, price: num(l.price), negotiable: l.negotiable, condition: s(l.condition),
    area: num(l.area), areaUnit: l.areaUnit ?? (l.category === "LAND" ? "KATHA" : "SQFT"), bedrooms: s(l.bedrooms), bathrooms: s(l.bathrooms), balconies: s(l.balconies),
    floor: s(l.floor), totalFloors: s(l.totalFloors), furnishing: s(l.furnishing),
    landType: s(l.landDetails?.landType), roadWidthFt: s(l.landDetails?.roadWidthFt), plotNo: s(l.landDetails?.plotNo), mouza: s(l.landDetails?.mouza), zoneId: s(l.zoneId),
    postalCode: s((l as unknown as { postalCode?: string }).postalCode), fullAddress: s(l.fullAddress),
    lat: l.lat === null ? "" : String(l.lat), lng: l.lng === null ? "" : String(l.lng), amenities: l.amenities, declaration: true,
  };
}

const digits = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d.]/g, "");
export const cleanNumber = (v: string, max = 12) => digits(v).slice(0, max);
export const cleanInt = (v: string, max = 9) => digits(v).replace(/\./g, "").slice(0, max);

/** "23.8103, 90.4125" or a Google Maps link (…@23.81,90.41,15z or …?q=23.81,90.41 or …!3d23.81!4d90.41). */
export function parseCoords(input: string): { lat: number; lng: number } | null {
  const t = input.trim();
  const m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ?? t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ?? t.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ?? t.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

const need = (code: string) => ({ message: code });
const positive = (v: string) => v !== "" && Number(v) > 0;

/** Same rules as the server's Zod schema, so most mistakes are caught before a request is sent. Error messages are translation keys. */
export const sellSchema = z.object({
  mode: z.enum(["SALE", "RENT"]),
  category: z.string(),
  title: z.string().trim().min(5, need("titleShort")).max(140, need("titleLong")),
  description: z.string().trim().min(20, need("descShort")).max(5000, need("descLong")),
  price: z.string().refine(positive, need("priceInvalid")).refine((v) => Number(v) < 1e12, need("priceInvalid")),
  condition: z.string().min(1, need("conditionRequired")),
  area: z.string(),
  bedrooms: z.string(),
  postalCode: z.string().refine((v) => v === "" || /^\d{4}$/.test(v), need("postalInvalid")),
  division: z.any().refine(Boolean, need("placeRequired")),
  district: z.any().refine(Boolean, need("placeRequired")),
  upazila: z.any().refine(Boolean, need("placeRequired")),
  lat: z.string(),
  lng: z.string(),
  roadWidthFt: z.string(),
  declaration: z.literal(true, need("declaration")),
}).superRefine((v, ctx) => {
  const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const land = v.category === "LAND";
  if (land && !positive(v.area)) add("area", "areaRequired");
  if (!land && v.area !== "" && !positive(v.area)) add("area", "areaInvalid");
  if (["FLAT", "APARTMENT"].includes(v.category) && v.bedrooms === "") add("bedrooms", "bedroomsRequired");
  if ((v.lat === "") !== (v.lng === "")) add("lat", "coordsTogether");
  if (v.lat !== "" && (Math.abs(Number(v.lat)) > 90 || Math.abs(Number(v.lng)) > 180 || Number.isNaN(Number(v.lat)) || Number.isNaN(Number(v.lng)))) add("lat", "coordsInvalid");
  if (v.roadWidthFt !== "" && (Number(v.roadWidthFt) < 1 || Number(v.roadWidthFt) > 500)) add("roadWidthFt", "roadInvalid");
});

export type SellErrors = Partial<Record<string, string>>;

export function validateSell(v: SellValues): SellErrors {
  const r = sellSchema.safeParse(v);
  if (r.success) return {};
  const out: SellErrors = {};
  for (const i of r.error.issues) { const k = String(i.path[0] ?? "form"); out[k] ??= i.message; }
  return out;
}

/** Which fields belong to which step: "Next" only checks the step you are on. */
export const STEP_FIELDS: Record<StepKey, string[]> = {
  basics: ["title", "description", "price", "condition", "category", "photos"],
  details: ["area", "bedrooms", "roadWidthFt"],
  location: ["division", "district", "upazila", "postalCode", "lat"],
  finish: ["declaration"],
};

export function validateStep(v: SellValues, step: StepKey): SellErrors {
  const all = validateSell({ ...v, declaration: true });
  return Object.fromEntries(Object.entries(all).filter(([k]) => STEP_FIELDS[step].includes(k)));
}

/** The earliest step that has a problem (used to jump back when a final check fails). */
export function firstBadStep(errors: SellErrors): StepKey | null {
  return STEPS.find((s) => STEP_FIELDS[s].some((k) => errors[k])) ?? null;
}

const n = (v: string) => (v === "" ? undefined : Number(v));

/** Body for POST /listings (and PATCH /listings/:id, where the server accepts the same fields). */
export function buildPayload(v: SellValues) {
  const land = isLand(v);
  const landDetails = land ? {
    landType: (v.landType || undefined) as Exclude<LandType, ""> | undefined, roadWidthFt: n(v.roadWidthFt),
    plotNo: v.plotNo.trim() || undefined, mouza: v.mouza.trim() || undefined,
  } : undefined;
  return {
    type: v.mode, category: v.category, title: v.title.trim(), description: v.description.trim(),
    price: Number(v.price), negotiable: v.negotiable,
    area: n(v.area), areaUnit: n(v.area) !== undefined ? v.areaUnit : undefined,
    ...(land ? {} : { bedrooms: n(v.bedrooms), bathrooms: n(v.bathrooms), balconies: n(v.balconies), floor: n(v.floor), totalFloors: n(v.totalFloors), furnishing: v.furnishing || undefined }),
    condition: v.condition || undefined,
    landDetails: landDetails && Object.values(landDetails).some((x) => x !== undefined) ? landDetails : undefined,
    zoneId: v.zoneId || undefined,
    division: v.division?.name, district: v.district?.name, upazila: v.upazila?.name, unionName: v.union?.name,
    postalCode: v.postalCode || undefined, fullAddress: v.fullAddress.trim() || undefined,
    lat: n(v.lat), lng: n(v.lng), amenities: v.amenities, declaration: v.declaration,
  };
}
