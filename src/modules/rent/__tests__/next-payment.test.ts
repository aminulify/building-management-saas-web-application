import { describe, expect, it } from "vitest";
import { nextPayment, type RecordLite } from "../next-payment";
import { tenantPaySchema } from "../tenant-pay.service";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));
const rec = (id: string, month: number, total: number, paid: number, status: RecordLite["status"]): RecordLite => ({ id, billingMonth: d(2026, month, 1), total, paid, dueDate: d(2026, month, 10), status });

describe("next payment due", () => {
  const now = d(2026, 10, 20); // 20 Nov 2026
  it("is the oldest month that is not fully paid, with what is still owed", () => {
    const n = nextPayment([rec("a", 9, 15000, 15000, "PAID"), rec("b", 10, 15000, 5000, "PARTIAL")], 15000, d(2026, 10, 5));
    expect(n).toMatchObject({ recordId: "b", month: "2026-11", amount: 10000, state: "PARTIAL" });
  });
  it("an older unpaid month comes before the current one and is overdue", () => {
    const n = nextPayment([rec("old", 8, 15000, 0, "OVERDUE"), rec("cur", 9, 15000, 0, "DUE")], 15000, now);
    expect(n).toMatchObject({ recordId: "old", month: "2026-09", amount: 15000, state: "OVERDUE" });
  });
  it("unpaid and not yet late is simply due", () => {
    expect(nextPayment([rec("c", 10, 15000, 0, "DUE")], 15000, d(2026, 10, 3)).state).toBe("DUE");
    expect(nextPayment([rec("c", 10, 15000, 0, "DUE")], 15000, d(2026, 10, 10)).state).toBe("DUE"); // the due day itself is still on time
    expect(nextPayment([rec("c", 10, 15000, 0, "DUE")], 15000, d(2026, 10, 11)).state).toBe("OVERDUE");
  });
  it("when everything is paid, the next month is shown as upcoming with the normal amount and no record to pay", () => {
    const n = nextPayment([rec("a", 9, 15000, 15000, "PAID"), rec("b", 10, 15000, 15000, "PAID")], 15500, now);
    expect(n.recordId).toBeNull();
    expect(n).toMatchObject({ month: "2026-12", amount: 15500, state: "UPCOMING" });
    expect(n.dueDate.toISOString().slice(0, 10)).toBe("2026-12-10");
  });
  it("with no bills at all it points at next month", () => {
    expect(nextPayment([], 12000, now)).toMatchObject({ recordId: null, month: "2026-12", amount: 12000, state: "UPCOMING" });
  });
});

describe("Send Paid Request body", () => {
  it("method and a transaction id are needed; the amount is optional", () => {
    expect(tenantPaySchema.safeParse({ method: "BKASH", reference: "9H7A5K2LM" }).success).toBe(true);
    expect(tenantPaySchema.safeParse({ method: "NAGAD", reference: "ABCD1234", amount: 12000 }).success).toBe(true);
    expect(tenantPaySchema.safeParse({ method: "BKASH" }).success).toBe(false);
    expect(tenantPaySchema.safeParse({ method: "BKASH", reference: "ab" }).success).toBe(false);
  });
  it("cash and card cannot be reported by a tenant; no negative amounts", () => {
    expect(tenantPaySchema.safeParse({ method: "CASH", reference: "ABCD1234" }).success).toBe(false);
    expect(tenantPaySchema.safeParse({ method: "CARD", reference: "ABCD1234" }).success).toBe(false);
    expect(tenantPaySchema.safeParse({ method: "BKASH", reference: "ABCD1234", amount: -5 }).success).toBe(false);
  });
});
