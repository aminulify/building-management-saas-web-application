import { describe, expect, it } from "vitest";
import { dhakaNow, isLate, ledgerState, tenureYears, unpaidSummary } from "../history-math";

const d = (s: string) => new Date(s);

describe("dhakaNow", () => {
  it("uses Bangladesh time (UTC+6) for the month and day", () => {
    expect(dhakaNow(d("2026-03-31T20:00:00Z"))).toEqual({ month: "2026-04", day: 1 });
    expect(dhakaNow(d("2026-03-15T10:00:00Z"))).toEqual({ month: "2026-03", day: 15 });
  });
});

describe("isLate (date-5 threshold)", () => {
  it("this month is late only after the 5th", () => {
    expect(isLate("2026-03", d("2026-03-05T10:00:00Z"))).toBe(false);
    expect(isLate("2026-03", d("2026-03-06T10:00:00Z"))).toBe(true);
  });
  it("earlier months are always late, later months never", () => {
    expect(isLate("2026-02", d("2026-03-01T10:00:00Z"))).toBe(true);
    expect(isLate("2026-04", d("2026-03-20T10:00:00Z"))).toBe(false);
  });
});

describe("ledgerState", () => {
  it("is Paid when nothing is owed, Pending when a request waits, otherwise Unpaid", () => {
    expect(ledgerState({ total: 100, paid: 100 }, false)).toBe("PAID");
    expect(ledgerState({ total: 100, paid: 0 }, true)).toBe("PENDING");
    expect(ledgerState({ total: 100, paid: 40 }, false)).toBe("UNPAID");
  });
});

describe("tenureYears", () => {
  const now = d("2026-04-01T00:00:00Z");
  it("adds up separate stays and runs an open stay to today", () => {
    const y = tenureYears([{ start: d("2021-06-01"), end: d("2022-12-31") }, { start: d("2023-01-01"), end: null }], now);
    expect(y).toBe(4.8);
  });
  it("counts overlapping stays once", () => {
    expect(tenureYears([{ start: d("2025-01-01"), end: d("2025-12-31") }, { start: d("2025-06-01"), end: d("2025-12-31") }], now)).toBe(1);
  });
  it("ignores a stay that has not started and gives 0 for none", () => {
    expect(tenureYears([{ start: d("2027-01-01"), end: null }], now)).toBe(0);
    expect(tenureYears([], now)).toBe(0);
  });
});

describe("unpaidSummary", () => {
  it("is clear when nothing is owed", () => {
    expect(unpaidSummary([], d("2026-03-20T10:00:00Z"))).toEqual({ amount: 0, late: 0, notLate: 0, state: "CLEAR" });
  });
  it("is overdue for an old month, and shows everything owed", () => {
    const s = unpaidSummary([{ month: "2026-02", owed: 25000 }, { month: "2026-03", owed: 25000 }], d("2026-03-02T10:00:00Z"));
    expect(s).toMatchObject({ state: "OVERDUE", late: 25000, notLate: 25000, amount: 50000 });
  });
  it("is only 'due soon' for this month before the 6th, then turns overdue", () => {
    expect(unpaidSummary([{ month: "2026-03", owed: 25000 }], d("2026-03-05T10:00:00Z")).state).toBe("DUE_SOON");
    expect(unpaidSummary([{ month: "2026-03", owed: 25000 }], d("2026-03-06T10:00:00Z")).state).toBe("OVERDUE");
  });
});
