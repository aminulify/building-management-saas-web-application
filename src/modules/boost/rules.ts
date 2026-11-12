import { z } from "zod";
import { uuid } from "@/lib/api/common";
import { bdPhoneSchema } from "@/modules/users/schema";

/** Boost settings live in platform settings (Super Admin → Paid Boost → settings). These are the values used until they are changed. */
export const BOOST_DEFAULTS = { enabled: true, fee: 100, durationDays: 7 } as const;

export type BoostState = "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED" | "CANCELLED";

/** What a boost is right now. An approved boost is Active until its end date, then Expired. */
export function boostState(b: { status: string; endsAt: Date | null }, now = new Date()): BoostState {
  if (b.status === "APPROVED") return b.endsAt && b.endsAt.getTime() > now.getTime() ? "ACTIVE" : "EXPIRED";
  if (b.status === "REJECTED" || b.status === "CANCELLED" || b.status === "PENDING") return b.status;
  return "EXPIRED";
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

export const boostSettingsSchema = z.object({
  enabled: z.boolean(),
  fee: z.coerce.number().min(10).max(100_000).multipleOf(0.01),
  durationDays: z.coerce.number().int().min(1).max(90),
});
export const boostSettingsPatch = boostSettingsSchema.partial().strict().refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

/** Same rules as the subscription bKash form: a Bangladesh mobile (013–019) and a 10-character TrxID kept in capitals. */
export const boostRequestSchema = z.object({
  listingId: uuid,
  senderNumber: bdPhoneSchema,
  trxId: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "trxid_format"),
});

export const boostRejectSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const boostListQuery = z.object({
  status: z.enum(["all", "pending", "active", "expired", "rejected", "failed"]).default("all"),
  q: z.string().trim().max(80).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const myBoostsQuery = z.object({ listingId: uuid.optional() });

/** Super Admin edit: move a boost to Active / Expired / Payment failed, and/or change how many days it runs. */
export const boostEditSchema = z.object({
  state: z.enum(["ACTIVE", "EXPIRED", "FAILED"]).optional(),
  durationDays: z.coerce.number().int().min(1).max(90).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
}).strict().refine((v) => v.state !== undefined || v.durationDays !== undefined, { message: "empty_update" });
