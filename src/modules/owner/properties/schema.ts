import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
export const propertyFormSchema = z.object({
  name: z.string().trim().min(2, "propertyNameMin").max(120, "tooLong"),
  location: z.string().trim().min(3, "propertyLocationMin").max(200, "tooLong"),
  totalSqft: z.string().trim().min(1, "sqftRequired").regex(/^\d+$/, "wholeNumber").refine((v) => Number(v) >= 1 && Number(v) <= 10_000_000, "sqftRange"),
  totalUnits: z.string().trim().min(1, "unitsRequired").regex(/^\d+$/, "wholeNumber").refine((v) => Number(v) >= 1 && Number(v) <= 1000, "unitsRange"),
});
export type PropertyFormValues = z.input<typeof propertyFormSchema>;

/** returns a `validation.*` key, or null when the image is fine */
export function checkPropertyImage(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "imageType";
  if (file.size === 0) return "fileEmpty";
  if (file.size > MAX_IMAGE_BYTES) return "imageSize";
  return null;
}

/** Case-insensitive match on name or location (the live search). */
export function matchesQuery(p: { name: string; locationLabel: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || p.name.toLowerCase().includes(q) || p.locationLabel.toLowerCase().includes(q);
}
