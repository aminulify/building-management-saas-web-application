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

export const LEAVE_REASONS = ["JOB_TRANSFER", "PURCHASED_HOME", "UPGRADED_UNIT", "LEASE_EXPIRED", "OTHER"] as const;
export const BEHAVIORS = ["EXCELLENT", "GOOD", "AVERAGE", "UGLY", "BAD", "VERY_BAD"] as const;

export const endTenancySchema = z.object({
  leaveReason: z.enum(LEAVE_REASONS).optional(),
  behavior: z.enum(BEHAVIORS).optional(),
  ownerNotes: z.string().trim().max(1000).optional(),
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
  .object({
    phone: bdPhoneSchema.optional(), email: z.string().trim().toLowerCase().email().max(120).optional(),
    /** the permanent Tenant ID, e.g. TF100015 */
    tenantCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{4,10}$/, "tenant_code_format").optional(),
  })
  .refine((v) => [v.phone, v.email, v.tenantCode].filter(Boolean).length === 1, { message: "phone_or_email", path: ["phone"] });

/** Previous Tenants list: search by tenant name or phone, one property, one behaviour rating, page numbers. */
export const pastTenantsQuery = z.object({
  q: z.string().trim().max(60).optional(),
  propertyId: uuid.optional(),
  behavior: z.enum([...BEHAVIORS, "UNRATED"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/** Owner edits the record of a past tenancy: reason, rating, lease dates, private notes. */
export const pastRecordSchema = z
  .object({
    leaveReason: z.enum(LEAVE_REASONS).nullable(),
    behavior: z.enum(BEHAVIORS).nullable(),
    startDate: dateOnly,
    endDate: dateOnly,
    ownerNotes: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
