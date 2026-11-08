import { z } from "zod";
import { uuid } from "@/lib/api/common";
import { bdPhoneSchema } from "@/modules/users/schema";

const cycle = z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]);

export const quoteSchema = z.object({ planId: uuid, cycle });

/** Same rules as the bKash modal (architecture 9.2): BD mobile 013–019, 10-char TrxID stored uppercase. */
export const upgradeRequestSchema = z.object({
  planId: uuid,
  cycle,
  senderNumber: bdPhoneSchema,
  trxId: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "trxid_format"),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const upgradeListQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).default("PENDING"),
});

export const feeEstimateQuery = z.object({
  properties: z.coerce.number().int().min(1).max(12),
  cycle: cycle.default("MONTHLY"),
});
