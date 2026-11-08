import { z } from "zod";
import { coords, dateOnly, money, pageQuery, uuid } from "@/lib/api/common";

export const AMENITIES = [
  "SECURITY", "PARKING", "MOSQUE", "SCHOOL", "COLLEGE", "UNIVERSITY", "HIGHWAY", "PARK", "PLAYGROUND",
  "HOSPITAL", "MARKET", "LIFT", "GENERATOR", "GATED", "CCTV", "SECURITY_GUARD",
] as const;

const landDetails = z.object({
  plotNo: z.string().trim().max(40).optional(),
  mouza: z.string().trim().max(80).optional(),
  dagNo: z.string().trim().max(40).optional(),
  landType: z.enum(["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL"]).optional(),
  roadWidthFt: z.coerce.number().min(1).max(500).optional(),
});

const base = z.object({
  type: z.enum(["RENT", "SALE"]),
  category: z.enum(["FLAT", "APARTMENT", "BUILDING", "LAND", "COMMERCIAL"]),
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(5000),
  price: money,
  negotiable: z.boolean(),
  area: z.coerce.number().positive().max(10_000_000).optional(),
  areaUnit: z.enum(["SQFT", "KATHA", "DECIMAL", "BIGHA"]).optional(),
  bedrooms: z.coerce.number().int().min(0).max(30).optional(),
  bathrooms: z.coerce.number().int().min(0).max(30).optional(),
  floor: z.coerce.number().int().min(0).max(100).optional(),
  totalFloors: z.coerce.number().int().min(1).max(100).optional(),
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).optional(),
  landDetails: landDetails.optional(),
  zoneId: uuid.optional(),
  lat: coords.lat.optional(),
  lng: coords.lng.optional(),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length),
  propertyId: uuid.optional(),
  unitId: uuid.optional(),
  condition: z.enum(["NEW", "USED", "UNDER_CONSTRUCTION", "RENOVATED"]).optional(),
  availableFrom: dateOnly.optional(),
  videoUrl: z.string().url().max(300).startsWith("https://").optional(),
  fullAddress: z.string().trim().max(300).optional(),
  declaration: z.boolean(),
});

export const listingCreateSchema = base
  .extend({ negotiable: base.shape.negotiable.default(false), amenities: base.shape.amenities.default([]), declaration: base.shape.declaration.default(false) })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "lat_lng_together", path: ["lat"] })
  .refine((v) => v.category !== "LAND" || (v.area !== undefined && v.areaUnit !== undefined), { message: "land_needs_area", path: ["area"] })
  .refine((v) => !["FLAT", "APARTMENT"].includes(v.category) || v.bedrooms !== undefined, { message: "bedrooms_required", path: ["bedrooms"] });

export const listingUpdateSchema = base.partial().strict().refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const searchQuery = pageQuery.extend({
  type: z.enum(["RENT", "SALE"]).default("RENT"),
  category: z.enum(["FLAT", "APARTMENT", "BUILDING", "LAND", "COMMERCIAL"]).optional(),
  divisionId: uuid.optional(),
  districtId: uuid.optional(),
  upazilaId: uuid.optional(),
  zoneId: uuid.optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).max(30).optional(),
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).optional(),
  amenities: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.enum(AMENITIES)).max(AMENITIES.length)).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popularity", "area_desc"]).default("newest"),
  lat: coords.lat.optional(),
  lng: coords.lng.optional(),
  radiusKm: z.coerce.number().min(0.1).max(50).optional(),
  bathrooms: z.coerce.number().int().min(0).max(30).optional(),
  minArea: z.coerce.number().positive().optional(),
  maxArea: z.coerce.number().positive().optional(),
  floor: z.coerce.number().int().min(0).max(100).optional(),
  nearby: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.enum(["MOSQUE", "SCHOOL", "COLLEGE", "UNIVERSITY", "HOSPITAL", "MARKET", "PARK", "PLAYGROUND", "HIGHWAY"])).max(9)).optional(),
  nearbyM: z.coerce.number().int().min(100).max(10000).optional(),
});

export const myListingsQuery = z.object({
  status: z.enum(["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "SUSPENDED", "SOLD", "RENTED", "EXPIRED", "ARCHIVED"]).optional(),
});

export const imageSchema = z.object({ storageKey: z.string().trim().min(3).max(300), order: z.coerce.number().int().min(0).max(30).default(0) });

export const LISTING_ACTIONS = ["renew", "mark-sold", "mark-rented", "deactivate", "archive"] as const;
export type ListingAction = (typeof LISTING_ACTIONS)[number];

export const MOD_ACTIONS = ["approve", "reject", "suspend", "restore", "feature", "unfeature", "flag"] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];
export const modBodySchema = z.object({ reason: z.string().trim().min(3).max(300).optional() });

export const reportSchema = z.object({
  category: z.enum(["FAKE", "SPAM", "WRONG_INFO", "ALREADY_SOLD", "SCAM", "OTHER"]),
  description: z.string().trim().max(500).optional(),
  evidence: z.array(z.string().min(10).max(300)).max(5).default([]),
});
export const inquirySchema = z.object({ message: z.string().trim().min(2).max(1000) });
export const savedSearchSchema = z.object({ query: searchQuery.omit({ cursor: true, limit: true }).partial().passthrough() });
export const adminListingsQuery = z.object({
  status: z.enum(["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "SUSPENDED", "SOLD", "RENTED", "EXPIRED", "ARCHIVED"]).default("PENDING"),
});

export const listingDocSchema = z.object({ storageKey: z.string().min(10).max(300), order: z.coerce.number().int().min(0).max(30).default(0) });
