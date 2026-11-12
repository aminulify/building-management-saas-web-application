import { describe, expect, it } from "vitest";
import { EXIT_STATES, PAGE_SIZE, archiveListQuery, archiveWhere, exitStateSchema, ownerExitState } from "../service";
import { OWNER_EXIT_REASONS, OWNER_EXIT_TEXT } from "../reasons";

describe("Previous Owners rules", () => {
  it("ten per page, four archive states, the five reasons of the design plus four more", () => {
    expect(PAGE_SIZE).toBe(10);
    expect([...EXIT_STATES]).toEqual(["ARCHIVED", "BANNED", "INACTIVE", "DELETED"]);
    expect(OWNER_EXIT_REASONS).toHaveLength(9);
    for (const r of OWNER_EXIT_REASONS) expect(OWNER_EXIT_TEXT[r].length).toBeGreaterThan(2);
  });
  it("Banned and Deleted win; an archive date means Archived; otherwise the account is just Inactive", () => {
    expect(ownerExitState({ status: "BANNED", archivedAt: new Date() })).toBe("BANNED");
    expect(ownerExitState({ status: "DELETED", archivedAt: new Date() })).toBe("DELETED");
    expect(ownerExitState({ status: "INACTIVE", archivedAt: new Date() })).toBe("ARCHIVED");
    expect(ownerExitState({ status: "INACTIVE", archivedAt: null })).toBe("INACTIVE");
  });
  it("the list takes a status, a reason, a search and a page number", () => {
    expect(archiveListQuery.parse({})).toMatchObject({ status: "all", reason: "all", page: 1 });
    expect(archiveListQuery.safeParse({ status: "BANNED", reason: "BUSINESS_CLOSED", q: "OW1656", page: "2" }).success).toBe(true);
    for (const bad of [{ status: "ACTIVE" }, { reason: "BORED" }, { page: "0" }, { page: "1.5" }, { q: "x".repeat(81) }]) expect(archiveListQuery.safeParse(bad).success).toBe(false);
  });
  it("reactivating needs no reason; every other state needs one", () => {
    expect(exitStateSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    for (const s of EXIT_STATES) {
      expect(exitStateSchema.safeParse({ status: s }).success).toBe(false);
      expect(exitStateSchema.safeParse({ status: s, reason: "BUSINESS_CLOSED" }).success).toBe(true);
    }
    expect(exitStateSchema.safeParse({ status: "SUSPENDED", reason: "OTHER" }).success).toBe(false);
    expect(exitStateSchema.safeParse({ status: "BANNED", reason: "OTHER", note: "x".repeat(301) }).success).toBe(false);
    expect(exitStateSchema.safeParse({ status: "ACTIVE", extra: 1 }).success).toBe(false);
  });
  it("the where clause stays inside Owners and adds each filter", () => {
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "all" }))).toContain('"OWNER"');
    expect(JSON.stringify(archiveWhere({ status: "BANNED", reason: "all" }))).toContain('"BANNED"');
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "NON_PAYMENT" }))).toContain('"NON_PAYMENT"');
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "OTHER" }))).toContain("null");
    expect(JSON.stringify(archiveWhere({ status: "all", reason: "all", q: "OW1656" }))).toContain("OW1656");
  });
});
