import { z } from "zod";
import { money, uuid } from "@/lib/api/common";

export const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month_format");

export const overviewQuery = z.object({ month: monthParam.optional() });
export const recordsQuery = z.object({ agreementId: uuid, status: z.enum(["DUE", "PARTIAL", "PAID", "OVERDUE"]).optional() });

export const paymentSchema = z.object({
  amount: money,
  /** false = recorded but not yet confirmed; it does not reduce the balance until the owner verifies it */
  verified: z.boolean().default(true),
  method: z.enum(["CASH", "BKASH", "NAGAD", "ROCKET", "BANK", "CARD"]),
  /** TrxID / cheque no. Required for digital methods so duplicates can be rejected. */
  reference: z.string().trim().min(4).max(40).optional(),
  paidAt: z.coerce.date().max(new Date(Date.now() + 5 * 60_000)).default(() => new Date()),
}).refine((v) => v.method === "CASH" || !!v.reference, { message: "reference_required", path: ["reference"] });

export const cronRentSchema = z.object({ month: monthParam.optional() });
