import { z } from "zod";

const money = z.coerce.number().positive().max(1_000_000).multipleOf(0.01);
const percent = z.coerce.number().min(0).max(100);
const count = z.coerce.number().int().min(0).max(100_000);

const planFields = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,23}$/),
  nameBn: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  audience: z.enum(["OWNER", "SELLER"]),
  monthlyPrice: money,
  quarterlyDiscount: percent,
  yearlyDiscount: percent,
  propertyLimit: count,
  unitLimit: count,
  listingLimit: count,
  listingDurationDays: z.coerce.number().int().min(1).max(365),
  features: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
});

/** Defaults live only on create. A PATCH must never reset fields the caller did not send. */
export const planCreateSchema = planFields.extend({
  quarterlyDiscount: planFields.shape.quarterlyDiscount.default(10),
  yearlyDiscount: planFields.shape.yearlyDiscount.default(20),
  propertyLimit: planFields.shape.propertyLimit.default(0),
  unitLimit: planFields.shape.unitLimit.default(0),
  listingLimit: planFields.shape.listingLimit.default(0),
  listingDurationDays: planFields.shape.listingDurationDays.default(30),
  features: planFields.shape.features.default({}),
});

export const planUpdateSchema = planFields
  .omit({ code: true, audience: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export type PlanCreate = z.infer<typeof planCreateSchema>;
export type PlanUpdate = z.infer<typeof planUpdateSchema>;
