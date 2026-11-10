import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
export const unitFormSchema = z.object({
  propertyId: z.string().min(1, "propertyRequired"),
  unitNumber: z.string().trim().min(1, "unitNameRequired").max(20, "unitNameTooLong"),
  /** "1".."5"; "5" is shown as "5+ Bedrooms" */
  bedrooms: z.string().min(1, "bedroomsRequired").regex(/^[1-5]$/, "bedroomsRequired"),
  sqft: z.string().trim().min(1, "sqftRequired").regex(/^\d+$/, "wholeNumber").refine((v) => Number(v) >= 50 && Number(v) <= 100_000, "unitSqftRange"),
  rent: z.string().trim().min(1, "rentRequired").regex(/^\d+(\.\d{1,2})?$/, "rentFormat").refine((v) => Number(v) > 0 && Number(v) <= 100_000_000, "rentRange"),
  // optional extras ("more details")
  floor: z.string().trim().regex(/^\d{0,3}$/, "wholeNumber"),
  bathrooms: z.string().regex(/^\d{1,2}$/, "wholeNumber"),
  diningRooms: z.string().regex(/^\d{1,2}$/, "wholeNumber"),
  kitchens: z.string().regex(/^\d{1,2}$/, "wholeNumber"),
});
export type UnitFormValues = z.input<typeof unitFormSchema>;

/** "Unit 101" → 1, "Flat 4A" → 4, "B-12" → 0 (single digits are floors, hundreds are floors), clamped to the building. */
export function deriveFloor(unitNumber: string, totalFloors: number): number {
  const m = unitNumber.match(/\d+/);
  if (!m) return Math.min(1, totalFloors);
  const n = Number(m[0]);
  const floor = n >= 100 ? Math.floor(n / 100) : n;
  return Math.max(0, Math.min(floor, totalFloors));
}

/** The phone number the owner types into the tenant search; only a complete 11-digit mobile number is looked up. */
export const isFullPhone = (v: string) => /^01[3-9]\d{8}$/.test(v);

/** Phone typed with spaces, dashes or +88 → plain 01XXXXXXXXX. */
export function normalizePhone(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.startsWith("880") ? "0" + d.slice(3) : d;
}

export const statusTone = { OCCUPIED: "success", VACANT: "pink", MAINTENANCE: "warning" } as const;
