import { describe, expect, it } from "vitest";
import { freeListQuery, freeStatusSchema } from "../service";

describe("Tenant Free rules", () => {
  it("the list takes an NID tab, a search and a page number", () => {
    expect(freeListQuery.parse({})).toMatchObject({ tab: "all", page: 1 });
    for (const tab of ["VERIFIED", "PENDING", "UNVERIFIED", "REJECTED"]) expect(freeListQuery.safeParse({ tab }).success).toBe(true);
    for (const bad of [{ tab: "nope" }, { page: "0" }, { page: "1.5" }]) expect(freeListQuery.safeParse(bad).success).toBe(false);
  });
  it("Active needs no reason, Suspended needs one", () => {
    expect(freeStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(freeStatusSchema.safeParse({ status: "SUSPENDED" }).success).toBe(false);
    expect(freeStatusSchema.safeParse({ status: "SUSPENDED", comment: "ab" }).success).toBe(false);
    expect(freeStatusSchema.safeParse({ status: "SUSPENDED", comment: "Fake documents" }).success).toBe(true);
    expect(freeStatusSchema.safeParse({ status: "WARNING", comment: "nope nope" }).success).toBe(false);
    expect(freeStatusSchema.safeParse({ status: "ACTIVE", extra: 1 }).success).toBe(false);
  });
});
