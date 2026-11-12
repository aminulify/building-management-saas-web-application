import { describe, expect, it } from "vitest";
import { DOC_KINDS, docKindParam, documentReviewSchema, tenantEditSchema, tenantState, tenantsListQuery } from "../service";

describe("Active Tenants rules", () => {
  it("Notice Given means the tenant has told the owner they will leave", () => {
    expect(tenantState({ noticeGivenAt: null })).toBe("ACTIVE");
    expect(tenantState({ noticeGivenAt: new Date() })).toBe("NOTICE_GIVEN");
  });
  it("the list takes a tab, a search and a page number", () => {
    expect(tenantsListQuery.parse({})).toMatchObject({ tab: "all", page: 1 });
    expect(tenantsListQuery.safeParse({ tab: "notice", page: "2", q: "rahim" }).success).toBe(true);
    for (const bad of [{ tab: "gone" }, { page: "0" }, { page: "1.5" }]) expect(tenantsListQuery.safeParse(bad).success).toBe(false);
  });
  it("the edit window takes a unit, an end date and Active / Notice Given, nothing else", () => {
    const id = "0192f2c4-1b7e-7a3c-8d11-5d6f0a0c1111";
    expect(tenantEditSchema.safeParse({ status: "NOTICE_GIVEN" }).success).toBe(true);
    expect(tenantEditSchema.safeParse({ endDate: "2026-12-31", unitId: id }).success).toBe(true);
    for (const bad of [{}, { status: "ENDED" }, { endDate: "31/12/2026" }, { endDate: "2026-13-45" }, { unitId: "x" }, { status: "ACTIVE", rent: 5 }]) expect(tenantEditSchema.safeParse(bad).success).toBe(false);
  });
  it("the list has a verification filter: All, Verified, Pending, Rejected, Not Verified", () => {
    expect(tenantsListQuery.parse({}).verification).toBe("all");
    for (const v of ["VERIFIED", "PENDING", "REJECTED", "UNVERIFIED"]) expect(tenantsListQuery.safeParse({ verification: v }).success).toBe(true);
    expect(tenantsListQuery.safeParse({ verification: "MAYBE" }).success).toBe(false);
  });
  it("three documents can be reviewed: NID front, NID back and the agreement", () => {
    expect([...DOC_KINDS]).toEqual(["NID_FRONT", "NID_BACK", "AGREEMENT"]);
    expect(docKindParam.safeParse("NID_BACK").success).toBe(true);
    expect(docKindParam.safeParse("DEED").success).toBe(false);
  });
  it("verifying needs no reason; rejecting needs one", () => {
    expect(documentReviewSchema.safeParse({ decision: "VERIFIED" }).success).toBe(true);
    expect(documentReviewSchema.safeParse({ decision: "REJECTED" }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ decision: "REJECTED", note: "ab" }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ decision: "REJECTED", note: "The photo is blurry" }).success).toBe(true);
    expect(documentReviewSchema.safeParse({ decision: "PENDING" }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ decision: "VERIFIED", extra: 1 }).success).toBe(false);
  });
});
