import { describe, expect, it } from "vitest";
import { addDays, BOOST_DEFAULTS, boostListQuery, boostRejectSchema, boostRequestSchema, boostSettingsPatch, boostSettingsSchema, boostState } from "../rules";

const now = new Date("2026-11-12T10:00:00Z");
const later = new Date("2026-11-19T10:00:00Z");
const earlier = new Date("2026-11-05T10:00:00Z");

describe("boost state", () => {
  it("pending, rejected and cancelled stay as they are", () => {
    expect(boostState({ status: "PENDING", endsAt: null }, now)).toBe("PENDING");
    expect(boostState({ status: "REJECTED", endsAt: null }, now)).toBe("REJECTED");
    expect(boostState({ status: "CANCELLED", endsAt: null }, now)).toBe("CANCELLED");
  });
  it("an approved boost is Active until its end date, then Expired", () => {
    expect(boostState({ status: "APPROVED", endsAt: later }, now)).toBe("ACTIVE");
    expect(boostState({ status: "APPROVED", endsAt: earlier }, now)).toBe("EXPIRED");
    expect(boostState({ status: "APPROVED", endsAt: now }, now)).toBe("EXPIRED");
    expect(boostState({ status: "APPROVED", endsAt: null }, now)).toBe("EXPIRED");
  });
});

describe("boost length and settings", () => {
  it("adds whole days", () => expect(addDays(now, 7).toISOString()).toBe(later.toISOString()));
  it("the fee starts at 100 taka for 7 days, switched on", () => expect(BOOST_DEFAULTS).toEqual({ enabled: true, fee: 100, durationDays: 7 }));
  it("settings: fee 10 to 100000 with paisa, days 1 to 90", () => {
    expect(boostSettingsSchema.safeParse({ enabled: true, fee: 100, durationDays: 7 }).success).toBe(true);
    expect(boostSettingsSchema.safeParse({ enabled: false, fee: "250.50", durationDays: "30" }).success).toBe(true);
    expect(boostSettingsSchema.safeParse({ enabled: true, fee: 5, durationDays: 7 }).success).toBe(false);
    expect(boostSettingsSchema.safeParse({ enabled: true, fee: 100.123, durationDays: 7 }).success).toBe(false);
    expect(boostSettingsSchema.safeParse({ enabled: true, fee: 100, durationDays: 0 }).success).toBe(false);
    expect(boostSettingsSchema.safeParse({ enabled: true, fee: 100, durationDays: 91 }).success).toBe(false);
  });
  it("a settings change may carry any of the three, but not nothing and not unknown keys", () => {
    expect(boostSettingsPatch.safeParse({ fee: 150 }).success).toBe(true);
    expect(boostSettingsPatch.safeParse({ enabled: false }).success).toBe(true);
    expect(boostSettingsPatch.safeParse({}).success).toBe(false);
    expect(boostSettingsPatch.safeParse({ fee: 150, colour: "red" }).success).toBe(false);
  });
});

describe("boost payment input", () => {
  const ok = { listingId: "0192f2c4-1b7e-7a3c-8d11-5d6f0a0c1111", senderNumber: "01712345678", trxId: "9ab3c4d5e6" };
  it("a bKash number and a 10-character TrxID (kept in capitals)", () => {
    const r = boostRequestSchema.parse(ok);
    expect(r.trxId).toBe("9AB3C4D5E6");
  });
  it("rejects a bad number, a short TrxID and a missing listing", () => {
    expect(boostRequestSchema.safeParse({ ...ok, senderNumber: "0123" }).success).toBe(false);
    expect(boostRequestSchema.safeParse({ ...ok, trxId: "SHORT" }).success).toBe(false);
    expect(boostRequestSchema.safeParse({ ...ok, listingId: "x" }).success).toBe(false);
  });
  it("a rejection needs a reason", () => {
    expect(boostRejectSchema.safeParse({ reason: "No such TrxID" }).success).toBe(true);
    expect(boostRejectSchema.safeParse({ reason: "no" }).success).toBe(false);
  });
  it("the admin list: all tabs, 10 rows, capped, with an optional search", () => {
    expect(boostListQuery.parse({})).toEqual({ status: "all", limit: 10 });
    expect(boostListQuery.safeParse({ status: "refunded" }).success).toBe(false);
    expect(boostListQuery.safeParse({ limit: "99" }).success).toBe(false);
    expect(boostListQuery.parse({ status: "pending", q: "  Savar " })).toMatchObject({ status: "pending", q: "Savar" });
  });
});
