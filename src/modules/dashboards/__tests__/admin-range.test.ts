import { describe, expect, it } from "vitest";
import { activePlansQuery } from "../admin-overview.service";
import { adminRangeQuery, dhakaMonthStart, dhakaToday, endOfDay, resolveRange, startOfDay } from "../admin-range";

describe("admin date range", () => {
  it("a day runs from 00:00 to 23:59:59.999 Dhaka time (UTC+6)", () => {
    expect(startOfDay("2026-10-01").toISOString()).toBe("2026-09-30T18:00:00.000Z");
    expect(endOfDay("2026-12-30").toISOString()).toBe("2026-12-30T17:59:59.999Z");
  });

  it("today in Dhaka is already tomorrow late in the evening UTC", () => {
    expect(dhakaToday(new Date("2026-11-11T20:30:00Z"))).toBe("2026-11-12");
    expect(dhakaMonthStart(new Date("2026-11-30T19:00:00Z"))).toBe("2026-12-01");
  });

  it("empty query means this month so far", () => {
    const r = resolveRange({}, new Date("2026-11-11T05:00:00Z"));
    expect([r.from, r.to]).toEqual(["2026-11-01", "2026-11-11"]);
  });

  it("only a start in the future still gives a valid range", () => {
    const r = resolveRange({ from: "2027-01-05" }, new Date("2026-11-11T05:00:00Z"));
    expect(r.from <= r.to).toBe(true);
  });

  it("rejects bad dates, reversed ranges and ranges over ten years", () => {
    expect(adminRangeQuery.safeParse({ from: "2026-13-01" }).success).toBe(false);
    expect(adminRangeQuery.safeParse({ from: "01/10/2026" }).success).toBe(false);
    expect(adminRangeQuery.safeParse({ from: "2026-12-30", to: "2026-10-01" }).success).toBe(false);
    expect(adminRangeQuery.safeParse({ from: "2000-01-01", to: "2026-10-01" }).success).toBe(false);
    expect(adminRangeQuery.safeParse({ from: "2026-10-01", to: "2026-12-30" }).success).toBe(true);
  });
});

describe("active plans query", () => {
  it("defaults to all users, 9 rows", () => {
    expect(activePlansQuery.parse({})).toEqual({ segment: "all", limit: 9 });
  });
  it("only knows the four segments and caps the page size", () => {
    expect(activePlansQuery.safeParse({ segment: "admins" }).success).toBe(false);
    expect(activePlansQuery.safeParse({ limit: "500" }).success).toBe(false);
    expect(activePlansQuery.parse({ segment: "free", limit: "10" }).limit).toBe(10);
  });
});
