import { describe, expect, it } from "vitest";
import { canEdit, cards, contentLocked, inTab, issueFrom, listQuery, moveStats, preferredIso, requestSchema, tabCount, toLocalInput, uiStatus } from "../logic";
import type { Stats } from "../types";

const stats: Stats = { total: 5, resolutionRate: 20, open: 2, inProgress: 2, critical: 1, byStatus: { PENDING: 1, APPROVED: 1, IN_PROGRESS: 2, COMPLETED: 1 } };

describe("tenant maintenance list", () => {
  it("asks for 3 on the first load and 5 per Load More", () => {
    expect(listQuery("all")).toBe("limit=3");
    expect(listQuery("all", "abc")).toBe("limit=5&cursor=abc");
  });
  it("maps the tabs to statuses", () => {
    expect(listQuery("active")).toContain("statuses=PENDING%2CAPPROVED%2CIN_PROGRESS");
    expect(listQuery("completed", "x")).toContain("statuses=COMPLETED");
  });
  it("knows which tab a status belongs to", () => {
    expect(inTab("all", "REJECTED")).toBe(true);
    expect(inTab("active", "IN_PROGRESS")).toBe(true);
    expect(inTab("active", "COMPLETED")).toBe(false);
    expect(inTab("completed", "COMPLETED")).toBe(true);
    expect(inTab("completed", "PENDING")).toBe(false);
  });
});

describe("tenant maintenance numbers", () => {
  it("builds the three cards and the tab counts", () => {
    expect(cards(stats)).toEqual({ active: 4, completed: 1, pending: 2 });
    expect(tabCount("all", stats)).toBe(5);
    expect(tabCount("active", stats)).toBe(4);
    expect(tabCount("completed", stats)).toBe(1);
  });
  it("adds a new Pending request", () => {
    const s = moveStats(stats, "CRITICAL", null, "PENDING");
    expect(s.total).toBe(6);
    expect(cards(s)).toEqual({ active: 5, completed: 1, pending: 3 });
    expect(s.critical).toBe(2);
  });
  it("moves a request to Completed and removes one", () => {
    const done = moveStats(stats, "LOW", "IN_PROGRESS", "COMPLETED");
    expect(cards(done)).toEqual({ active: 3, completed: 2, pending: 2 });
    expect(done.resolutionRate).toBe(40);
    const gone = moveStats(stats, "LOW", "COMPLETED", null);
    expect(gone.total).toBe(4);
    expect(cards(gone).completed).toBe(0);
  });
  it("never goes below zero", () => {
    expect(moveStats({ ...stats, byStatus: {}, open: 0, inProgress: 0, critical: 0 }, "CRITICAL", "PENDING", null).critical).toBe(0);
  });
});

describe("tenant maintenance edit rules", () => {
  it("shows Approved as Pending", () => {
    expect(uiStatus("APPROVED")).toBe("PENDING");
    expect(uiStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
  });
  it("closed requests cannot be edited", () => {
    expect(canEdit("REJECTED")).toBe(false);
    expect(canEdit("CANCELLED")).toBe(false);
    expect(canEdit("COMPLETED")).toBe(true);
  });
  it("locks the details once work starts, unless a completed request is reopened", () => {
    expect(contentLocked("PENDING", "PENDING")).toBe(false);
    expect(contentLocked("IN_PROGRESS", "IN_PROGRESS")).toBe(true);
    expect(contentLocked("COMPLETED", "COMPLETED")).toBe(true);
    expect(contentLocked("COMPLETED", "PENDING")).toBe(false);
  });
});

describe("tenant maintenance form", () => {
  const ok = { category: "PLUMBING", priority: "MEDIUM", status: "PENDING", title: "Leaking tap", description: "The tap leaks", preferred: "" } as const;
  it("accepts a valid request, with or without a preferred time", () => {
    expect(requestSchema.safeParse(ok).success).toBe(true);
    expect(requestSchema.safeParse({ ...ok, preferred: toLocalInput(new Date(Date.now() + 86_400_000).toISOString()) }).success).toBe(true);
  });
  it("rejects short words and a time in the past or too far away", () => {
    expect(requestSchema.safeParse({ ...ok, title: "ab" }).error?.issues[0]?.message).toBe("titleShort");
    expect(requestSchema.safeParse({ ...ok, description: "no" }).error?.issues[0]?.message).toBe("descShort");
    expect(requestSchema.safeParse({ ...ok, preferred: "2020-01-01T10:00" }).error?.issues[0]?.message).toBe("preferredPast");
    expect(requestSchema.safeParse({ ...ok, preferred: toLocalInput(new Date(Date.now() + 800 * 86_400_000).toISOString()) }).error?.issues[0]?.message).toBe("preferredFar");
  });
  it("converts the preferred time both ways", () => {
    expect(preferredIso("")).toBeUndefined();
    const iso = new Date(Date.now() + 3_600_000).toISOString();
    expect(new Date(preferredIso(toLocalInput(iso))!).getTime()).toBeGreaterThan(Date.now());
    expect(toLocalInput(null)).toBe("");
  });
  it("builds a card for a request that was just created", () => {
    const i = issueFrom({ id: "1", category: "GAS", title: "t", description: "d", priority: "LOW", status: "PENDING", createdAt: "2026-11-11T00:00:00Z" }, { property: "Shanti Nibash", unit: "102", tenant: "Rahim" }, null);
    expect(i.unit.property.name).toBe("Shanti Nibash");
    expect(i.tenant.fullName).toBe("Rahim");
    expect(i.preferredAt).toBeNull();
  });
});
