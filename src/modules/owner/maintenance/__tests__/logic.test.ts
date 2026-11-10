import { describe, expect, it } from "vitest";
import { PAGE_SIZE, adjustStats, canPick, inTab, listQuery, tabCount } from "../logic";
import type { Stats } from "../types";

const stats = (over: Partial<Stats> = {}): Stats => ({ total: 30, resolutionRate: 70, open: 3, inProgress: 6, critical: 1, byStatus: { PENDING: 3, IN_PROGRESS: 6, COMPLETED: 21 }, ...over });

describe("the list asks for 4 at a time and the right statuses", () => {
  it("pages of four", () => {
    expect(PAGE_SIZE).toBe(4);
    expect(new URLSearchParams(listQuery("all")).get("limit")).toBe("4");
  });
  it("each tab maps to its statuses ('Pending' also holds approved requests)", () => {
    expect(new URLSearchParams(listQuery("all")).get("statuses")).toBeNull();
    expect(new URLSearchParams(listQuery("pending")).get("statuses")).toBe("PENDING,APPROVED");
    expect(new URLSearchParams(listQuery("progress")).get("statuses")).toBe("IN_PROGRESS");
    expect(new URLSearchParams(listQuery("completed")).get("statuses")).toBe("COMPLETED");
  });
  it("sends the cursor for 'Load more'", () => {
    expect(new URLSearchParams(listQuery("all", "abc")).get("cursor")).toBe("abc");
  });
});

describe("which cards belong to a tab", () => {
  it("All shows everything, the others only their own", () => {
    expect(inTab("all", "CANCELLED")).toBe(true);
    expect(inTab("pending", "APPROVED")).toBe(true);
    expect(inTab("pending", "IN_PROGRESS")).toBe(false);
    expect(inTab("progress", "IN_PROGRESS")).toBe(true);
    expect(inTab("completed", "PENDING")).toBe(false);
  });
  it("only live requests get the status picker", () => {
    expect(["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"].every((s) => canPick(s as never))).toBe(true);
    expect(canPick("REJECTED")).toBe(false);
    expect(canPick("CANCELLED")).toBe(false);
  });
});

describe("the top cards move at once", () => {
  it("pending → in progress", () => {
    const s = adjustStats(stats(), { priority: "MEDIUM", status: "PENDING" }, "IN_PROGRESS");
    expect([s.open, s.inProgress, s.critical, s.total]).toEqual([2, 7, 1, 30]);
  });
  it("a critical issue stops counting when it is completed, and counts again when reopened", () => {
    const done = adjustStats(stats(), { priority: "CRITICAL", status: "IN_PROGRESS" }, "COMPLETED");
    expect([done.critical, done.inProgress, done.byStatus.COMPLETED, done.resolutionRate]).toEqual([0, 5, 22, 73]);
    const back = adjustStats(done, { priority: "CRITICAL", status: "COMPLETED" }, "PENDING");
    expect([back.critical, back.open]).toEqual([1, 4]);
  });
  it("moving between two live states keeps the critical count", () => {
    expect(adjustStats(stats(), { priority: "CRITICAL", status: "PENDING" }, "IN_PROGRESS").critical).toBe(1);
  });
  it("deleting lowers the total and the right counter, and never goes below zero", () => {
    const s = adjustStats(stats(), { priority: "CRITICAL", status: "PENDING" }, null);
    expect([s.total, s.open, s.critical]).toEqual([29, 2, 0]);
    const empty = adjustStats(stats({ total: 0, open: 0, critical: 0, byStatus: {} }), { priority: "LOW", status: "PENDING" }, null);
    expect([empty.open, empty.critical]).toEqual([0, 0]);
  });
  it("tab counts come from the same numbers", () => {
    const s = stats();
    expect([tabCount("all", s), tabCount("pending", s), tabCount("progress", s), tabCount("completed", s)]).toEqual([30, 3, 6, 21]);
  });
});
