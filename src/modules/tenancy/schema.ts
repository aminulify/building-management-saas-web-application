import { z } from "zod";
import { dateOnly, money, moneyOrZero, uuid } from "@/lib/api/common";
import { bdPhoneSchema } from "@/modules/users/schema";

export const inviteSchema = z
  .object({
    unitId: uuid,
    email: z.string().trim().toLowerCase().email().optional(),
    phone: bdPhoneSchema.optional(),
    rent: money.optional(),
    deposit: moneyOrZero.optional(),
    startDate: dateOnly,
    endDate: dateOnly.optional(),
  })
  .refine((v) => v.email || v.phone, { message: "email_or_phone", path: ["email"] })
  .refine((v) => !v.endDate || v.endDate > v.startDate, { message: "end_after_start", path: ["endDate"] });

export const tokenParam = z.string().regex(/^[a-f0-9]{64}$/);

export const tenancyListQuery = z.object({
  status: z.enum(["INVITED", "ACTIVE", "ENDED", "TERMINATED"]).optional(),
});

export const tenancyUpdateSchema = z
  .object({ rent: money, deposit: moneyOrZero, endDate: dateOnly.nullable(), members: z.coerce.number().int().min(1).max(30), noticeGiven: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const endTenancySchema = z.object({
  endDate: dateOnly.optional(),
  settlementAmount: moneyOrZero.optional(),
  terminated: z.boolean().default(false),
  reason: z.string().trim().max(300).optional(),
});

/** Owner-wide Tenants Directory: tabs, search and page numbers. */
export const tenantDirectoryQuery = z.object({
  tab: z.enum(["all", "leaveSoon", "overdue"]).default("all"),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/** Find a registered tenant by full phone number OR e-mail address (exact match only). */
export const tenantLookupQuery = z
  .object({ phone: bdPhoneSchema.optional(), email: z.string().trim().toLowerCase().email().max(120).optional() })
  .refine((v) => !!v.phone !== !!v.email, { message: "phone_or_email", path: ["phone"] });
