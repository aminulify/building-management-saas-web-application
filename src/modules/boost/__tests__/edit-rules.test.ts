import { describe, expect, it } from "vitest";
import { boostEditSchema, boostListQuery } from "../rules";

describe("Paid Boost edit and tabs", () => {
  it("accepts a state, a length, or both", () => {
    expect(boostEditSchema.safeParse({ state: "ACTIVE" }).success).toBe(true);
    expect(boostEditSchema.safeParse({ durationDays: 14 }).success).toBe(true);
    expect(boostEditSchema.safeParse({ state: "FAILED", reason: "TrxID not found" }).success).toBe(true);
  });
  it("refuses empty, unknown, or out-of-range edits", () => {
    expect(boostEditSchema.safeParse({}).success).toBe(false);
    expect(boostEditSchema.safeParse({ state: "PENDING" }).success).toBe(false);
    expect(boostEditSchema.safeParse({ durationDays: 0 }).success).toBe(false);
    expect(boostEditSchema.safeParse({ durationDays: 91 }).success).toBe(false);
    expect(boostEditSchema.safeParse({ state: "ACTIVE", extra: 1 }).success).toBe(false);
  });
  it("lists the four tabs of the page (and the older ones)", () => {
    for (const s of ["all", "active", "expired", "failed", "pending", "rejected"]) expect(boostListQuery.safeParse({ status: s }).success).toBe(true);
    expect(boostListQuery.safeParse({ status: "sleeping" }).success).toBe(false);
  });
});
