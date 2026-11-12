import { describe, expect, it } from "vitest";
import { accountState, ownerArchiveSchema, ownersListQuery, ownerStatusSchema } from "../service";

describe("Active Owners rules", () => {
  it("shows Suspended first, then a standing warning, otherwise Active", () => {
    expect(accountState({ status: "SUSPENDED", warnedAt: null })).toBe("SUSPENDED");
    expect(accountState({ status: "SUSPENDED", warnedAt: new Date() })).toBe("SUSPENDED");
    expect(accountState({ status: "ACTIVE", warnedAt: new Date() })).toBe("WARNING");
    expect(accountState({ status: "ACTIVE", warnedAt: null })).toBe("ACTIVE");
  });
  it("Warning and Suspended need a written reason; Active does not", () => {
    expect(ownerStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(ownerStatusSchema.safeParse({ status: "WARNING" }).success).toBe(false);
    expect(ownerStatusSchema.safeParse({ status: "SUSPENDED", comment: "ab" }).success).toBe(false);
    expect(ownerStatusSchema.safeParse({ status: "SUSPENDED", comment: "Repeated complaints" }).success).toBe(true);
    expect(ownerStatusSchema.safeParse({ status: "BANNED", comment: "nope" }).success).toBe(false);
    expect(ownerStatusSchema.safeParse({ status: "WARNING", comment: "x".repeat(501) }).success).toBe(false);
    expect(ownerStatusSchema.safeParse({ status: "WARNING", comment: "fine reason", extra: 1 }).success).toBe(false);
  });
  it("the list takes a mode, a plan tab, a search and a page number", () => {
    expect(ownersListQuery.parse({})).toMatchObject({ mode: "rental", tier: "all", page: 1 });
    expect(ownersListQuery.safeParse({ mode: "market", tier: "MILLIONAIRE", page: "3", q: "faruk" }).success).toBe(true);
    expect(ownersListQuery.parse({}).status).toBe("all");
    expect(ownersListQuery.parse({}).verification).toBe("all");
    for (const v of ["VERIFIED", "PENDING", "REJECTED", "UNVERIFIED"]) expect(ownersListQuery.safeParse({ verification: v }).success).toBe(true);
    expect(ownersListQuery.safeParse({ verification: "MAYBE" }).success).toBe(false);
    for (const ok of ["ACTIVE", "WARNING", "SUSPENDED"]) expect(ownersListQuery.safeParse({ status: ok }).success).toBe(true);
    for (const bad of [{ status: "BANNED" }, { tier: "GOLD" }, { mode: "x" }, { page: "0" }, { page: "1.5" }]) expect(ownersListQuery.safeParse(bad).success).toBe(false);
  });
  it("archiving takes an optional reason", () => {
    expect(ownerArchiveSchema.safeParse({}).success).toBe(true);
    expect(ownerArchiveSchema.safeParse({ reason: "ab" }).success).toBe(false);
    expect(ownerArchiveSchema.safeParse({ reason: "Left the platform" }).success).toBe(true);
  });
});
