import { z } from "zod";

/** The choices of the Amenities dropdown (Add New Property) and the checklist in View Details. Stored as codes in Property.amenities. */
export const AMENITY_CODES = [
  "NEAR_HOSPITAL", "NEAR_PARK", "NEAR_SCHOOL", "NEAR_BAZAR", "MOSQUE",
  "PARKING", "LIFT", "GENERATOR", "SECURITY", "CCTV", "GATED_COMMUNITY",
  "FURNISHED", "SEMI_FURNISHED", "UNFURNISHED",
] as const;
export type AmenityCode = (typeof AMENITY_CODES)[number];

/** A building is furnished in one way only. */
export const FURNISHING_CODES: readonly AmenityCode[] = ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"];

export const amenitiesSchema = z
  .array(z.enum(AMENITY_CODES))
  .max(AMENITY_CODES.length)
  .default([])
  .transform((a) => [...new Set(a)])
  .refine((a) => a.filter((x) => FURNISHING_CODES.includes(x)).length <= 1, { message: "one_furnishing" });

/** Older properties stored security features separately; they count as the matching amenity. */
const LEGACY: Record<string, AmenityCode> = { GATED: "GATED_COMMUNITY", CCTV: "CCTV", GUARD_24_7: "SECURITY", GENERATOR: "GENERATOR" };

export const allAmenities = (amenities: string[], securityFeatures: string[]): AmenityCode[] => {
  const set = new Set<string>(amenities);
  for (const s of securityFeatures) if (LEGACY[s]) set.add(LEGACY[s]!);
  return AMENITY_CODES.filter((c) => set.has(c));
};
