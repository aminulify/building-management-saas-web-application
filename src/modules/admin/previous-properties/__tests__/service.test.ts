import { describe, expect, it } from "vitest";
import { ARCHIVE_STATUSES, PAGE_SIZE, REASONS, archiveListQuery, archiveStatusSchema, archiveWhere } from "../service";

describe("Previous Properties rules", () => {
  it("ten per page, four archive states and the six reasons of the design plus the owners' own and Other", () => {
    expect(PAGE_SIZE).toBe(10);
    expect([...ARCHIVE_STATUSES]).toEqual(["ARCHIVED", "SUSPENDED", "INACTIVE", "DELETED"]);
    expect(REASONS).toHaveLength(10);
    expect(REASONS).toContain("OTHER");
  });
  it("the list takes a status, a reason, a search and a page number", () => {
    expect(archiveListQuery.parse({})).toMatchObject({ status: "all", reason: "all", page: 1 });
    expect(archiveListQuery.safeParse({ status: "SUSPENDED", reason: "NON_PAYMENT", q: "villa", page: "2" }).success).toBe(true);
    for (const bad of [{ status: "BANNED" }, { status: "ACTIVE" }, { reason: "BORED" }, { page: "0" }, { page: "1.5" }, { q: "x".repeat(81) }]) expect(archiveListQuery.safeParse(bad).success).toBe(false);
  });
  it("reactivating needs no reason; every other state needs one", () => {
    expect(archiveStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    for (const s of ARCHIVE_STATUSES) {
      expect(archiveStatusSchema.safeParse({ status: s }).success).toBe(false);
      expect(archiveStatusSchema.safeParse({ status: s, reason: "RENOVATION" }).success).toBe(true);
    }
    expect(archiveStatusSchema.safeParse({ status: "BANNED", reason: "OTHER" }).success).toBe(false);
    expect(archiveStatusSchema.safeParse({ status: "INACTIVE", reason: "OTHER", note: "x".repeat(301) }).success).toBe(false);
    expect(archiveStatusSchema.safeParse({ status: "ACTIVE", extra: 1 }).success).toBe(false);
  });
  it("the where clause always stays inside the archive and adds each filter", () => {
    const base = JSON.stringify(archiveWhere({ status: "all", reason: "all" }));
    expect(base).toContain("archivedAt");
    expect(JSON.stringify(archiveWhere({ status: "INACTIVE", reason: "all" }))).toContain('"INACTIVE"');
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "NON_PAYMENT" }))).toContain('"NON_PAYMENT"');
    // records saved before reasons existed count as "Other"
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "OTHER" }))).toContain("null");
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "all", q: "Sunrise" }))).toContain("Sunrise");
  });
});

describe("Owner delete reasons", () => {
  it("an owner picks one of seven reasons; Other needs a note; platform-only reasons are refused", async () => {
    const { archiveSchema } = await import("@/modules/properties/schema");
    expect(archiveSchema.safeParse({ reasonCode: "SOLD_PROPERTY" }).success).toBe(true);
    expect(archiveSchema.safeParse({ reasonCode: "NOT_INTERESTED", reason: "Changed my mind" }).success).toBe(true);
    expect(archiveSchema.safeParse({ reasonCode: "OTHER" }).success).toBe(false);
    expect(archiveSchema.safeParse({ reasonCode: "OTHER", reason: "Moving abroad" }).success).toBe(true);
    expect(archiveSchema.safeParse({ reason: "Deleted by the owner" }).success).toBe(true);
    for (const bad of ["NON_PAYMENT", "POLICY_VIOLATION", "BOGUS"]) expect(archiveSchema.safeParse({ reasonCode: bad }).success).toBe(false);
  });
});

describe("Super Admin delete reasons", () => {
  it("any platform reason is allowed, Other needs a note, unknown fields are refused", async () => {
    const { adminDeleteSchema } = await import("@/modules/admin/properties/service");
    for (const code of ["OWNER_REQUEST", "POLICY_VIOLATION", "NON_PAYMENT", "BUILDING_DEMOLISHED", "SOLD_PROPERTY"]) expect(adminDeleteSchema.safeParse({ reasonCode: code }).success).toBe(true);
    expect(adminDeleteSchema.safeParse({ reasonCode: "OTHER" }).success).toBe(false);
    expect(adminDeleteSchema.safeParse({ reasonCode: "OTHER", note: "Court order" }).success).toBe(true);
    expect(adminDeleteSchema.safeParse({ reasonCode: "BORED" }).success).toBe(false);
    expect(adminDeleteSchema.safeParse({ reasonCode: "SOLD_PROPERTY", extra: 1 }).success).toBe(false);
    expect(adminDeleteSchema.safeParse({ reasonCode: "SOLD_PROPERTY", note: "ab" }).success).toBe(false);
  });
});
