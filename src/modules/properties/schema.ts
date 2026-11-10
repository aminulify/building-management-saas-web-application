import { z } from "zod";
import { coords, dateOnly, moneyOrZero, money, uuid } from "@/lib/api/common";

const address = z.object({
  division: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  upazila: z.string().trim().max(60).optional(),
  area: z.string().trim().max(100).optional(),
  street: z.string().trim().max(200).optional(),
  postalCode: z.string().regex(/^\d{4}$/).optional(),
});

/** Owner-entered figures from the Properties list form. */
const listFields = {
  totalSqft: z.coerce.number().int().min(1).max(10_000_000),
  locationText: z.string().trim().min(3).max(200),
  /** how many units the building has; the list shows max(this, real unit rows) */
  declaredUnits: z.coerce.number().int().min(1).max(1000),
};

export const propertyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["APARTMENT_BUILDING", "HOUSE", "COMMERCIAL", "MIXED"]).default("APARTMENT_BUILDING"),
  /** optional: derived from declaredUnits (about 4 units per floor) when omitted */
  totalFloors: z.coerce.number().int().min(1).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  address: address.optional(),
  totalSqft: listFields.totalSqft.optional(),
  locationText: listFields.locationText.optional(),
  declaredUnits: listFields.declaredUnits.optional(),
  zoneId: uuid.optional(),
  ...{ lat: coords.lat.optional(), lng: coords.lng.optional() },
  securityFeatures: z.array(z.enum(["GATED", "CCTV", "GUARD_24_7", "FIRE_ALARM", "GENERATOR"])).max(10).default([]),
})
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "lat_lng_together", path: ["lat"] })
  .refine((v) => !!v.address || !!v.locationText, { message: "location_required", path: ["locationText"] });

export const propertyUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["APARTMENT_BUILDING", "HOUSE", "COMMERCIAL", "MIXED"]),
    totalFloors: z.coerce.number().int().min(1).max(100),
    description: z.string().trim().max(2000),
    zoneId: uuid.nullable(),
    securityFeatures: z.array(z.enum(["GATED", "CCTV", "GUARD_24_7", "FIRE_ALARM", "GENERATOR"])).max(10),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    ...listFields,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const archiveSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const imageSchema = z.object({ storageKey: z.string().trim().min(3).max(300), order: z.coerce.number().int().min(0).max(50).default(0) });

export const propertyListQuery = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

const unitFields = {
  unitNumber: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().min(0).max(100),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  diningRooms: z.coerce.number().int().min(0).max(10),
  kitchens: z.coerce.number().int().min(0).max(10),
  /** square footage */
  areaSqft: z.coerce.number().int().min(50).max(100_000),
  rent: money,
  deposit: moneyOrZero,
  utilityCharge: moneyOrZero,
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]),
  description: z.string().trim().max(1000),
};

export const unitCreateSchema = z.object({
  ...unitFields,
  bedrooms: unitFields.bedrooms.default(0),
  bathrooms: unitFields.bathrooms.default(0),
  diningRooms: unitFields.diningRooms.default(0),
  kitchens: unitFields.kitchens.default(0),
  deposit: unitFields.deposit.default(0),
  utilityCharge: unitFields.utilityCharge.default(0),
  furnishing: unitFields.furnishing.default("UNFURNISHED"),
  description: unitFields.description.optional(),
  /** an existing tenant (found by phone) to move in right away: the unit becomes OCCUPIED */
  tenantId: uuid.optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  members: z.coerce.number().int().min(1).max(30).optional(),
}).refine((v) => !v.endDate || !v.startDate || v.endDate > v.startDate, { message: "end_after_start", path: ["endDate"] });

export const assignTenantSchema = z.object({ tenantId: uuid, startDate: dateOnly.optional(), endDate: dateOnly.optional(), members: z.coerce.number().int().min(1).max(30).optional() })
  .refine((v) => !v.endDate || !v.startDate || v.endDate > v.startDate, { message: "end_after_start", path: ["endDate"] });

/** Owner-wide units list (Units Management page): live search, property and status filters, page numbers. */
export const ownerUnitsQuery = z.object({
  q: z.string().trim().max(40).optional(),
  propertyId: uuid.optional(),
  status: z.enum(["OCCUPIED", "VACANT", "MAINTENANCE"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const unitUpdateSchema = z
  .object({ ...unitFields, availability: z.enum(["AVAILABLE", "MAINTENANCE"]) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const unitListQuery = z.object({
  availability: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "ARCHIVED"]).optional(),
  floor: z.coerce.number().int().min(0).max(100).optional(),
});
