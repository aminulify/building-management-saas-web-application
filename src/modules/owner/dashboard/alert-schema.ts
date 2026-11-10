import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
export const alertFormSchema = z
  .object({
    message: z.string().trim().min(5, "alertMessageShort").max(500, "tooLong"),
    contact: z.string().trim().regex(/^01[3-9]\d{8}$/, "phoneInvalid"),
    name: z.string().trim().min(2, "fullNameMin").max(100, "fullNameMax"),
    thana: z.string().trim().min(2, "thanaRequired").max(100, "tooLong"),
    location: z.string().trim().max(300, "tooLong"),
    district: z.string().min(1, "districtRequired"),
    /** set when the owner used "Use current GPS location"; then the typed address becomes optional */
    hasGps: z.boolean(),
  })
  .refine((v) => v.hasGps || v.location.length >= 3, { path: ["location"], message: "locationRequired" });

export type AlertFormValues = z.input<typeof alertFormSchema>;
