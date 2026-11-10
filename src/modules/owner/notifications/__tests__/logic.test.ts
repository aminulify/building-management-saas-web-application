import { describe, expect, it } from "vitest";
import { FIRST_PAGE, MORE_PAGE, afterRead, kindOf, mergeFresh, monthLabel, relativeTime, storyRef, tabBadge } from "../logic";
import type { Notification } from "../types";

const n = (over: Partial<Notification> = {}): Notification => ({ id: "n1", type: "rent.received", titleKey: "notifications.rentReceived", params: {}, link: null, priority: "NORMAL", readAt: null, createdAt: "2026-11-10T10:00:00.000Z", category: "payment", ...over });

describe("page sizes", () => {
  it("six cards first, ten more per click", () => { expect([FIRST_PAGE, MORE_PAGE]).toEqual([6, 10]); });
});

describe("which card a notification becomes", () => {
  it("rent, emergencies, repairs and tenants each get their own look", () => {
    expect(kindOf(n())).toBe("received");
    expect(kindOf(n({ type: "rent.overdue" }))).toBe("overdue");
    expect(kindOf(n({ type: "sos.new" }))).toBe("emergency");
    expect(kindOf(n({ type: "maintenance.new" }))).toBe("maintenance");
    expect(kindOf(n({ type: "maintenance.comment" }))).toBe("maintenance");
    expect(kindOf(n({ type: "tenancy.accepted" }))).toBe("tenancy");
    expect(kindOf(n({ type: "subscription.expiring" }))).toBe("generic");
  });
  it("an emergency update is the yellow 'accept' card once solved, the pink quick card before", () => {
    expect(kindOf(n({ type: "sos.update", params: { status: "SOLVED" } }))).toBe("solve");
    expect(kindOf(n({ type: "sos.update", params: { status: "PROCESSING" } }))).toBe("quick");
  });
});

describe("the story behind a notification", () => {
  it("points at the receipt, the repair request or the incident", () => {
    expect(storyRef(n({ params: { paymentId: "p1" } }))).toEqual({ kind: "payment", id: "p1" });
    expect(storyRef(n({ type: "maintenance.new", params: { requestId: "r1" } }))).toEqual({ kind: "issue", id: "r1" });
    expect(storyRef(n({ type: "sos.new", params: { alertId: "a1" } }))).toEqual({ kind: "alert", id: "a1" });
    expect(storyRef(n({ type: "sos.update", params: { alertId: "a2" } }))).toEqual({ kind: "alert", id: "a2" });
  });
  it("has none for overdue rent, tenants or old notifications without ids", () => {
    expect(storyRef(n({ type: "rent.overdue", params: { recordId: "x" } }))).toBeNull();
    expect(storyRef(n({ params: {} }))).toBeNull();
    expect(storyRef(n({ type: "maintenance.new", params: {} }))).toBeNull();
  });
});

describe("relative time: 12 mins ago, yesterday, 2 days ago, last month", () => {
  const now = new Date(2026, 10, 10, 15, 0, 0).getTime(); // 10 Nov 2026, 15:00 (local)
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const day = (y: number, m: number, d: number) => new Date(y, m, d, 9, 0, 0).toISOString();
  it("minutes and hours on the same day", () => {
    expect(relativeTime(ago(20_000), now)).toEqual({ unit: "justNow", n: 0 });
    expect(relativeTime(ago(12 * 60_000), now)).toEqual({ unit: "min", n: 12 });
    expect(relativeTime(ago(45 * 60_000), now)).toEqual({ unit: "min", n: 45 });
    expect(relativeTime(ago(3 * 3_600_000), now)).toEqual({ unit: "hour", n: 3 });
  });
  it("yesterday, then days", () => {
    expect(relativeTime(day(2026, 10, 9), now)).toEqual({ unit: "yesterday", n: 1 });
    expect(relativeTime(day(2026, 10, 8), now)).toEqual({ unit: "day", n: 2 });
    expect(relativeTime(day(2026, 10, 4), now)).toEqual({ unit: "day", n: 6 });
  });
  it("weeks inside the month, 'last month', then months and years", () => {
    expect(relativeTime(day(2026, 10, 1), now)).toEqual({ unit: "week", n: 1 });
    expect(relativeTime(day(2026, 9, 20), now)).toEqual({ unit: "lastMonth", n: 1 });
    expect(relativeTime(day(2026, 6, 15), now)).toEqual({ unit: "month", n: 4 });
    expect(relativeTime(day(2025, 6, 15), now)).toEqual({ unit: "year", n: 1 });
  });
  it("never shows a time in the future", () => {
    expect(relativeTime(new Date(now + 5 * 60_000).toISOString(), now).unit).toBe("justNow");
  });
});

describe("live updates", () => {
  const a = n({ id: "a", createdAt: "2026-11-10T10:00:00.000Z" }), b = n({ id: "b", createdAt: "2026-11-10T09:00:00.000Z" });
  it("puts new notifications on top", () => {
    const fresh = n({ id: "new", createdAt: "2026-11-10T11:00:00.000Z" });
    const m = mergeFresh([a, b], [fresh, a, b]);
    expect(m.items.map((i) => i.id)).toEqual(["new", "a", "b"]);
    expect(m.added).toBe(1);
  });
  it("does not count an older notification that only moved into the first page", () => {
    const older = n({ id: "old", createdAt: "2026-11-09T09:00:00.000Z" });
    const m = mergeFresh([a, b], [a, b, older]);
    expect(m.added).toBe(0);
    expect(m.items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("shows a read mark made on another device", () => {
    const m = mergeFresh([a, b], [{ ...a, readAt: "2026-11-10T12:00:00.000Z" }, b]);
    expect(m.items[0]!.readAt).toBe("2026-11-10T12:00:00.000Z");
    expect(m.added).toBe(0);
  });
  it("fills an empty list", () => {
    expect(mergeFresh([], [a, b]).added).toBe(2);
  });
});

describe("badge numbers", () => {
  const counts = { unread: 15, unreadByCategory: { payment: 9, maintenance: 6 } };
  it("reading one lowers the total and its own tab", () => {
    expect(afterRead(counts, { category: "payment", readAt: null })).toEqual({ unread: 14, unreadByCategory: { payment: 8, maintenance: 6 } });
    expect(afterRead(counts, { category: "maintenance", readAt: null }).unreadByCategory).toEqual({ payment: 9, maintenance: 5 });
  });
  it("reading an 'other' notification only lowers the total, and a read one changes nothing", () => {
    expect(afterRead(counts, { category: "other", readAt: null })).toEqual({ unread: 14, unreadByCategory: { payment: 9, maintenance: 6 } });
    expect(afterRead(counts, { category: "payment", readAt: "x" })).toBe(counts);
  });
  it("never goes below zero; each tab shows its own number", () => {
    expect(afterRead({ unread: 0, unreadByCategory: { payment: 0, maintenance: 0 } }, { category: "payment", readAt: null }).unread).toBe(0);
    expect([tabBadge("all", counts), tabBadge("payment", counts), tabBadge("maintenance", counts)]).toEqual([15, 9, 6]);
  });
});

describe("month label", () => {
  it("says the month in words", () => {
    expect(monthLabel("en", "2026-11")).toBe("November 2026");
    expect(monthLabel("bn", "2026-11")).toContain("২০২৬");
    expect(monthLabel("en", "soon")).toBe("soon");
  });
});
