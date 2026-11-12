import { describe, expect, it } from "vitest";
import { LEAVE_REASONS, PAGE_SIZE, RENT_STATES, archiveListQuery, recordSchema } from "../service";
import { firstName, monthsOf, rentStateOf, unpaidFor } from "../logic";

describe("Previous Tenants rules", () => {
  it("ten per page, four rent states, the six reasons of the design plus two more", () => {
    expect(PAGE_SIZE).toBe(10);
    expect([...RENT_STATES]).toEqual(["CLEARED", "DUE_1", "DUE_2", "DUE_3_PLUS"]);
    expect(LEAVE_REASONS).toHaveLength(8);
  });
  it("months of unpaid rent become the state: 0 Cleared, 1, 2, 3 or more", () => {
    expect([0, 1, 2, 3, 4, 12].map(rentStateOf)).toEqual(["CLEARED", "DUE_1", "DUE_2", "DUE_3_PLUS", "DUE_3_PLUS", "DUE_3_PLUS"]);
    expect([monthsOf("CLEARED"), monthsOf("DUE_1"), monthsOf("DUE_2"), monthsOf("DUE_3_PLUS")]).toEqual([0, 1, 2, 3]);
  });
  it("the unpaid money follows the ledger; a ruling counts at least that many months; Cleared is always zero", () => {
    expect(unpaidFor("CLEARED", 5000, 8000, true)).toBe(0);
    expect(unpaidFor("DUE_2", 16000, 8000, false)).toBe(16000);
    expect(unpaidFor("DUE_1", 0, 8000, true)).toBe(8000);
    expect(unpaidFor("DUE_1", 12000, 8000, true)).toBe(12000);
    expect(unpaidFor("DUE_3_PLUS", 0, 8000, true)).toBe(24000);
  });
  it("the delete question uses the first name", () => {
    expect(firstName("Kamal Hossain")).toBe("Kamal");
    expect(firstName("  Rubina  ")).toBe("Rubina");
    expect(firstName("")).toBe("");
  });
  it("the list takes a rent status, a reason, a search and a page number", () => {
    expect(archiveListQuery.parse({})).toMatchObject({ rent: "all", reason: "all", page: 1 });
    expect(archiveListQuery.safeParse({ rent: "DUE_2", reason: "EVICTED", q: "TN5001", page: "3" }).success).toBe(true);
    for (const bad of [{ rent: "OWES" }, { reason: "BORED" }, { page: "0" }, { page: "1.5" }, { q: "x".repeat(81) }]) expect(archiveListQuery.safeParse(bad).success).toBe(false);
  });
  it("an edit needs at least one field and refuses unknown ones", () => {
    expect(recordSchema.safeParse({}).success).toBe(false);
    expect(recordSchema.safeParse({ rentStatus: "CLEARED" }).success).toBe(true);
    expect(recordSchema.safeParse({ reason: "EVICTED", note: "Court order" }).success).toBe(true);
    expect(recordSchema.safeParse({ rentStatus: "OWES" }).success).toBe(false);
    expect(recordSchema.safeParse({ note: "x".repeat(301) }).success).toBe(false);
    expect(recordSchema.safeParse({ rentStatus: "CLEARED", extra: 1 }).success).toBe(false);
  });
});
