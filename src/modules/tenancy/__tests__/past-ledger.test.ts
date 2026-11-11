import { describe, expect, it } from "vitest";
import { ledgerStatus, ledgerSummary, maskNid } from "../past-ledger";
import { pastRecordSchema, pastTenantsQuery } from "../schema";

const d = (y: number, m: number, day: number, h = 12) => new Date(Date.UTC(y, m, day, h));
const rec = (total: number, paid: number, payments: { amount: number; paidAt: Date }[]) => ({ total, paid, dueDate: d(2024, 0, 5, 0), payments });

describe("month status in the rent ledger", () => {
  it("paid by the end of the due day is on time", () => {
    expect(ledgerStatus(rec(10000, 10000, [{ amount: 10000, paidAt: d(2024, 0, 3) }]))).toBe("PAID_ON_TIME");
    expect(ledgerStatus(rec(10000, 10000, [{ amount: 10000, paidAt: d(2024, 0, 5, 23) }]))).toBe("PAID_ON_TIME");
  });
  it("paid after the due day is late, judged by the LAST payment", () => {
    expect(ledgerStatus(rec(10000, 10000, [{ amount: 10000, paidAt: d(2024, 0, 6, 1) }]))).toBe("PAID_LATE");
    expect(ledgerStatus(rec(10000, 10000, [{ amount: 5000, paidAt: d(2024, 0, 2) }, { amount: 5000, paidAt: d(2024, 0, 20) }]))).toBe("PAID_LATE");
  });
  it("not paid in full when they left is defaulted (nothing paid, or only part)", () => {
    expect(ledgerStatus(rec(10000, 0, []))).toBe("DEFAULTED");
    expect(ledgerStatus(rec(10000, 4000, [{ amount: 4000, paidAt: d(2024, 0, 2) }]))).toBe("DEFAULTED");
  });
  it("a month with nothing to pay is never a default", () => { expect(ledgerStatus(rec(0, 0, []))).toBe("PAID_ON_TIME"); });
});

describe("money summary", () => {
  it("totals, dues at checkout and on-time rate", () => {
    const s = ledgerSummary([
      { total: 10000, paid: 10000, status: "PAID_ON_TIME" },
      { total: 10000, paid: 10000, status: "PAID_LATE" },
      { total: 10000, paid: 4000, status: "DEFAULTED" },
      { total: 10000, paid: 10000, status: "PAID_ON_TIME" },
    ]);
    expect(s).toMatchObject({ collected: 34000, dues: 6000, months: 4, onTime: 2, late: 1, defaulted: 1, onTimeRate: 50 });
  });
  it("no months → no rate (not 0%)", () => { expect(ledgerSummary([]).onTimeRate).toBeNull(); });
  it("an overpaid month never makes the dues negative", () => { expect(ledgerSummary([{ total: 100, paid: 150, status: "PAID_ON_TIME" }]).dues).toBe(0); });
});

describe("NID is masked", () => {
  it("only the last four digits", () => { expect(maskNid("1234")).toBe("•••• •••• 1234"); expect(maskNid(null)).toBeNull(); });
});

describe("request shapes", () => {
  it("list query: filters, defaults, limits", () => {
    expect(pastTenantsQuery.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(pastTenantsQuery.parse({ behavior: "UNRATED", q: " Rahim " })).toMatchObject({ behavior: "UNRATED", q: "Rahim" });
    expect(pastTenantsQuery.safeParse({ behavior: "AWFUL" }).success).toBe(false);
    expect(pastTenantsQuery.safeParse({ propertyId: "nope" }).success).toBe(false);
    expect(pastTenantsQuery.safeParse({ pageSize: 500 }).success).toBe(false);
  });
  it("record edit: any one field, nothing unknown", () => {
    expect(pastRecordSchema.safeParse({ behavior: "GOOD" }).success).toBe(true);
    expect(pastRecordSchema.safeParse({ behavior: null, ownerNotes: null, leaveReason: null }).success).toBe(true);
    expect(pastRecordSchema.safeParse({}).success).toBe(false);
    expect(pastRecordSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
    expect(pastRecordSchema.safeParse({ leaveReason: "BORED" }).success).toBe(false);
    expect(pastRecordSchema.safeParse({ ownerNotes: "x".repeat(1001) }).success).toBe(false);
  });
});
