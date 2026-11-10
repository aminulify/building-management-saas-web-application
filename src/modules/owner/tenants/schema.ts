import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
const members = z.string().trim().min(1, "membersRequired").regex(/^\d+$/, "wholeNumber").refine((v) => Number(v) >= 1 && Number(v) <= 30, "membersRange");
const date = (required: string) => z.string().min(1, required).regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");

export const addTenantSchema = z
  .object({
    tenantId: z.string().min(1, "tenantRequired"),
    propertyId: z.string().min(1, "propertyRequired"),
    unitId: z.string().min(1, "unitRequired"),
    startDate: date("entryDateRequired"),
    endDate: date("leaseDateRequired"),
    members,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, { path: ["endDate"], message: "leaseAfterEntry" });
export type AddTenantValues = z.input<typeof addTenantSchema>;

export const editTenantSchema = z
  .object({
    endDate: date("leaseDateRequired"),
    members,
    rent: z.string().trim().min(1, "rentRequired").regex(/^\d+(\.\d{1,2})?$/, "rentFormat").refine((v) => Number(v) > 0 && Number(v) <= 100_000_000, "rentRange"),
    deposit: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "rentFormat"),
  });
export type EditTenantValues = z.input<typeof editTenantSchema>;

/** yyyy-mm-dd for an ISO string or Date (UTC, so the day never shifts with the time zone). */
export const toDateInput = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

/** Today as yyyy-mm-dd in UTC. */
export const todayInput = () => new Date().toISOString().slice(0, 10);

/** One day after a yyyy-mm-dd date (the lease must end after the entry date). */
export function dayAfter(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export const statusTone = { ACTIVE: "success", OVERDUE: "pink", NOTICE_GIVEN: "warning" } as const;
