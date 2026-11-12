import { describe, expect, it } from "vitest";
import { EXPIRING_DAYS, PAGE_SIZE, reminderAudience, reminderSchema, subListQuery } from "../service";

describe("Subscriptions & Packages rules", () => {
  it("ten per page and a seven-day Expiring Soon window", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(EXPIRING_DAYS).toBe(7);
  });
  it("the list takes a package, a status, an Owner ID search and a page number", () => {
    expect(subListQuery.parse({})).toMatchObject({ plan: "all", status: "all", page: 1 });
    expect(subListQuery.safeParse({ plan: "MILLIONAIRE", status: "EXPIRING", q: "OW10032", page: "2" }).success).toBe(true);
    for (const bad of [{ plan: "GOLD" }, { status: "SLEEPING" }, { page: "0" }, { page: "1.5" }]) expect(subListQuery.safeParse(bad).success).toBe(false);
  });
  it("a reminder goes to Expiring Soon owners, Expired owners or everyone", () => {
    for (const a of ["expiring", "expired", "all"]) expect(reminderAudience.safeParse(a).success).toBe(true);
    expect(reminderAudience.safeParse("nobody").success).toBe(false);
  });
  it("a reminder needs a title and a message", () => {
    expect(reminderSchema.safeParse({ audience: "all", title: "News", body: "Dear [name], hello" }).success).toBe(true);
    expect(reminderSchema.safeParse({ audience: "all", title: "Hi", body: "Dear [name], hello" }).success).toBe(false);
    expect(reminderSchema.safeParse({ audience: "all", title: "News", body: "ab" }).success).toBe(false);
    expect(reminderSchema.safeParse({ audience: "all", title: "News", body: "x".repeat(1501) }).success).toBe(false);
    expect(reminderSchema.safeParse({ audience: "all", title: "News", body: "Hello there", extra: 1 }).success).toBe(false);
  });
});
