import { describe, expect, it } from "vitest";
import { PAGE, daysUntil, lookOf, markRead, mergeFeed, monthLabels, patchLive } from "../logic";
import type { FeedItem, Live } from "../types";

const item = (o: Partial<FeedItem>): FeedItem => ({ id: "a", type: "rent.invoice", titleKey: "x", params: {}, priority: "NORMAL", readAt: null, createdAt: "2026-02-01T00:00:00Z", tab: "payment", live: null, ...o });
const rent = (state: "PAID" | "PENDING" | "UNPAID"): Live => ({ kind: "rent", recordId: "r", state, owed: "100", total: "100", month: "2026-02", late: false });
const alert = (status: "NEED_ACTION" | "PROCESSING" | "SOLVED" | "FALSE_ALARM", accepted = false): Live => ({ kind: "alert", id: "s", type: "THEFT", status, accepted });

describe("tenant feed cards", () => {
  it("pages ten at a time", () => { expect(PAGE).toBe(10); });

  it("an unpaid bill offers Send Pay Request and Mark as Read", () => {
    const l = lookOf(item({ live: rent("UNPAID") }));
    expect(l.tone).toBe("green");
    expect(l.actions).toEqual(["pay", "read"]);
    expect(l.badge).toBeNull();
  });
  it("a bill that is paid shows a PAID badge and no pay button", () => {
    const l = lookOf(item({ live: rent("PAID"), readAt: "x" }));
    expect(l.actions).toEqual([]);
    expect(l.badge).toBe("PAID");
  });
  it("a pending request shows PENDING REQUEST", () => {
    expect(lookOf(item({ live: rent("PENDING") })).badge).toBe("PENDING_REQUEST");
  });
  it("overdue rent is the red 'violate agreement' card", () => {
    const l = lookOf(item({ type: "rent.late", live: rent("UNPAID") }));
    expect(l).toMatchObject({ tone: "red", tag: "unpaid", actions: ["pay"] });
    expect(lookOf(item({ type: "rent.late", live: rent("PAID") })).tone).toBe("green");
  });
  it("a repair update offers Track Status", () => {
    expect(lookOf(item({ type: "maintenance.status" })).actions).toEqual(["track", "read"]);
    expect(lookOf(item({ type: "maintenance.removed" })).actions).toEqual(["read"]);
  });
  it("an emergency follows its live status", () => {
    const k = (live: Live) => lookOf(item({ type: "sos.sent", live }));
    expect(k(alert("NEED_ACTION"))).toMatchObject({ tone: "pink", badge: "PENDING", wide: true });
    expect(k(alert("PROCESSING")).badge).toBe("PROCESSING");
    expect(k(alert("SOLVED"))).toMatchObject({ tone: "yellow", tag: "accept", actions: ["accept", "unsolved"] });
    expect(k(alert("SOLVED", true)).badge).toBe("COMPLETED");
    expect(k(alert("FALSE_ALARM")).badge).toBe("CLOSED");
  });
  it("anything else is a plain card", () => {
    expect(lookOf(item({ type: "message.new" })).tone).toBe("slate");
  });
});

describe("feed helpers", () => {
  it("labels months, one or several", () => {
    expect(monthLabels("en", "2026-02")).toBe("February 2026");
    expect(monthLabels("en", "2026-01, 2026-02")).toBe("January 2026, February 2026");
    expect(monthLabels("en", "soon")).toBe("soon");
  });
  it("counts days to a date in Bangladesh time", () => {
    const now = new Date("2026-02-05T10:00:00Z");
    expect(daysUntil("2026-02-10", now)).toBe(5);
    expect(daysUntil("2026-02-05", now)).toBe(0);
    expect(daysUntil("2026-02-01", now)).toBe(-4);
  });
  it("puts new notifications on top and refreshes the ones on screen", () => {
    const cur = [item({ id: "b" }), item({ id: "a", live: rent("UNPAID") })];
    const out = mergeFeed(cur, [item({ id: "c" }), item({ id: "a", live: rent("PAID") }), item({ id: "0" })]);
    expect(out.map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(out[2]!.live).toMatchObject({ state: "PAID" });
  });
  it("marks one read and patches a live state", () => {
    const list = [item({ id: "a", live: alert("SOLVED") }), item({ id: "b" })];
    expect(markRead(list, "b")[1]!.readAt).not.toBeNull();
    expect(markRead(list, "b")[0]!.readAt).toBeNull();
    const done = patchLive(list, (n) => n.id === "a", (l) => (l.kind === "alert" ? { ...l, accepted: true } : l));
    expect(lookOf(item({ type: "sos.sent", live: done[0]!.live })).badge).toBe("COMPLETED");
  });
});
