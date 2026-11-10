import { describe, expect, it } from "vitest";
import { actionFor, cyclePrice, daysUntil, discountOf, monthlyBill, nextPlan, periodLeftPercent, rangeOf } from "../plan-math";
import type { Cycle, Plan } from "../types";

const prices = (m: number, qd = 10, yd = 20) => ({
  MONTHLY: { months: 1, total: (m).toFixed(2), savings: "0.00" },
  QUARTERLY: { months: 4, total: (m * 4 * (1 - qd / 100)).toFixed(2), savings: (m * 4 * (qd / 100)).toFixed(2) },
  YEARLY: { months: 12, total: (m * 12 * (1 - yd / 100)).toFixed(2), savings: (m * 12 * (yd / 100)).toFixed(2) },
});
const plan = (code: string, m: number, props: number, units: number): Plan => ({
  id: code, code, nameBn: code, nameEn: code, audience: "OWNER", monthlyPrice: m.toFixed(2), quarterlyDiscount: 10, yearlyDiscount: 20,
  propertyLimit: props, unitLimit: units, listingLimit: 5, features: {}, prices: prices(m),
});
const plans = [plan("PRIMARY", 159, 2, 40), plan("MILLIONAIRE", 299, 4, 160), plan("BILLIONAIRE", 699, 12, 500)];

describe("plan prices on the cards", () => {
  it("quarterly is 4 months at 10% off, yearly 12 months at 20% off (whole taka as in the design)", () => {
    const whole = (p: Plan, c: Cycle) => Math.round(cyclePrice(p, c));
    expect([whole(plans[0]!, "MONTHLY"), whole(plans[0]!, "QUARTERLY"), whole(plans[0]!, "YEARLY")]).toEqual([159, 572, 1526]);
    expect([whole(plans[1]!, "MONTHLY"), whole(plans[1]!, "QUARTERLY"), whole(plans[1]!, "YEARLY")]).toEqual([299, 1076, 2870]);
    expect([whole({ ...plans[2]!, prices: prices(799) }, "QUARTERLY"), whole({ ...plans[2]!, prices: prices(799) }, "YEARLY")]).toEqual([2876, 7670]);
  });
  it("shows the discount of each billing period", () => {
    expect([discountOf(plans[0]!, "MONTHLY"), discountOf(plans[0]!, "QUARTERLY"), discountOf(plans[0]!, "YEARLY")]).toEqual([0, 10, 20]);
  });
});

describe("plan ranges", () => {
  it("each plan starts where the cheaper one ends", () => {
    expect(rangeOf(plans, 0, "propertyLimit")).toEqual([1, 2]);
    expect(rangeOf(plans, 1, "propertyLimit")).toEqual([3, 4]);
    expect(rangeOf(plans, 2, "unitLimit")).toEqual([161, 500]);
  });
});

describe("the button on a plan card", () => {
  it("is Active on your plan, Upgrade above it, Switch below it", () => {
    expect(actionFor(plans, plans[1]!, "MILLIONAIRE", false)).toBe("active");
    expect(actionFor(plans, plans[2]!, "MILLIONAIRE", false)).toBe("upgrade");
    expect(actionFor(plans, plans[0]!, "MILLIONAIRE", false)).toBe("switch");
  });
  it("offers Renew on your own plan when it is nearly over, and Get when you have no plan", () => {
    expect(actionFor(plans, plans[1]!, "MILLIONAIRE", true)).toBe("renew");
    expect(actionFor(plans, plans[1]!, null, false)).toBe("choose");
  });
  it("suggests the next plan up, none on the top plan", () => {
    expect(nextPlan(plans, "PRIMARY")?.code).toBe("MILLIONAIRE");
    expect(nextPlan(plans, "BILLIONAIRE")).toBeNull();
    expect(nextPlan(plans, null)).toBeNull();
  });
});

describe("billing period numbers", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  it("counts whole days left and never goes below zero", () => {
    expect(daysUntil("2026-11-22T00:00:00Z", now)).toBe(12);
    expect(daysUntil("2026-11-10T06:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-10-01T00:00:00Z", now)).toBe(0);
    expect(daysUntil(null, now)).toBe(0);
  });
  it("shows how much of the paid period is left", () => {
    expect(periodLeftPercent({ startsAt: "2026-10-23T00:00:00Z", endsAt: "2026-11-22T00:00:00Z" }, now)).toBe(40);
    expect(periodLeftPercent({ startsAt: "2026-10-23T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }, now)).toBe(0);
    expect(periodLeftPercent({ startsAt: null, endsAt: null }, now)).toBe(0);
  });
  it("spreads what was paid over the months it covers", () => {
    expect(monthlyBill({ amount: "2396.80", cycle: "QUARTERLY" })).toBeCloseTo(599.2, 5);
    expect(monthlyBill({ amount: "6710.40", cycle: "YEARLY" })).toBeCloseTo(559.2, 5);
    expect(monthlyBill({ amount: "299.00", cycle: "MONTHLY" })).toBe(299);
  });
});
