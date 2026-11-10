import { describe, expect, it } from "vitest";
import { daysUntil, formatDate, formatPhone } from "../format";
import { addTenantSchema, dayAfter, editTenantSchema, toDateInput } from "../schema";

const ok = { tenantId: "t1", propertyId: "p1", unitId: "u1", startDate: "2026-11-02", endDate: "2027-03-31", members: "4" };

describe("addTenantSchema", () => {
  it("accepts a complete form", () => expect(addTenantSchema.safeParse(ok).success).toBe(true));
  it("needs a tenant, property, unit and both dates", () => {
    for (const k of ["tenantId", "propertyId", "unitId", "startDate", "endDate"] as const) expect(addTenantSchema.safeParse({ ...ok, [k]: "" }).success).toBe(false);
  });
  it("lease must end after the entry date", () => {
    expect(addTenantSchema.safeParse({ ...ok, endDate: "2026-11-02" }).success).toBe(false);
    expect(addTenantSchema.safeParse({ ...ok, endDate: "2026-10-01" }).success).toBe(false);
  });
  it("members is a whole number from 1 to 30", () => {
    expect(addTenantSchema.safeParse({ ...ok, members: "0" }).success).toBe(false);
    expect(addTenantSchema.safeParse({ ...ok, members: "31" }).success).toBe(false);
    expect(addTenantSchema.safeParse({ ...ok, members: "2.5" }).success).toBe(false);
    expect(addTenantSchema.safeParse({ ...ok, members: "" }).success).toBe(false);
  });
});

describe("editTenantSchema", () => {
  const e = { endDate: "2027-01-31", members: "3", rent: "25000", deposit: "50000" };
  it("accepts valid values and rejects bad rent", () => {
    expect(editTenantSchema.safeParse(e).success).toBe(true);
    expect(editTenantSchema.safeParse({ ...e, rent: "0" }).success).toBe(false);
    expect(editTenantSchema.safeParse({ ...e, deposit: "-5" }).success).toBe(false);
  });
});

describe("date + phone helpers", () => {
  it("formats a stored phone like the design", () => {
    expect(formatPhone("01712345678")).toBe("+880 1712-345678");
    expect(formatPhone(null)).toBe("—");
  });
  it("formats dates in UTC", () => {
    expect(formatDate("en", "2025-11-02T00:00:00.000Z")).toBe("Nov 02, 2025");
    expect(toDateInput("2026-03-31T00:00:00.000Z")).toBe("2026-03-31");
  });
  it("dayAfter and daysUntil", () => {
    expect(dayAfter("2026-02-28")).toBe("2026-03-01");
    const now = new Date("2026-11-10T15:00:00Z");
    expect(daysUntil("2026-11-20T00:00:00Z", now)).toBe(10);
    expect(daysUntil("2026-11-05T00:00:00Z", now)).toBe(-5);
    expect(daysUntil(null, now)).toBeNull();
  });
});
