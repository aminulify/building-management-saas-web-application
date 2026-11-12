import { describe, expect, it } from "vitest";
import { BUCKETS, bucketOf, maintenanceEditSchema, maintenanceListQuery, normalizePercent, ticketOf } from "../service";

describe("Active Maintenance rules", () => {
  it("category shares always add up to exactly 100", () => {
    for (const counts of [[1, 1, 1], [3, 3, 3, 1], [7, 5, 4], [1], [50, 30, 20], [2, 1]]) expect(normalizePercent(counts).reduce((a, b) => a + b, 0)).toBe(100);
    expect(normalizePercent([])).toEqual([]);
    expect(normalizePercent([0, 0])).toEqual([0, 0]);
  });
  it("reads REQ numbers in the ways people type them", () => {
    expect(ticketOf("REQ-1001")).toBe(1001);
    expect(ticketOf("req 1002")).toBe(1002);
    expect(ticketOf("1003")).toBe(1003);
    expect(ticketOf("REQ1004")).toBe(1004);
    expect(ticketOf("leak")).toBeNull();
    expect(ticketOf("12")).toBeNull();
  });
  it("the edit window takes priority, status and technician, nothing else", () => {
    expect(maintenanceEditSchema.safeParse({ priority: "CRITICAL" }).success).toBe(true);
    expect(maintenanceEditSchema.safeParse({ status: "COMPLETED", technicianName: null }).success).toBe(true);
    expect(maintenanceEditSchema.safeParse({}).success).toBe(false);
    expect(maintenanceEditSchema.safeParse({ status: "REJECTED" }).success).toBe(false);
    expect(maintenanceEditSchema.safeParse({ priority: "URGENT" }).success).toBe(false);
    expect(maintenanceEditSchema.safeParse({ technicianName: "A" }).success).toBe(false);
    expect(maintenanceEditSchema.safeParse({ priority: "LOW", title: "x" }).success).toBe(false);
  });
  it("five groups: Electrical, Plumbing, Water, Security, and everything else is Other", () => {
    expect([...BUCKETS]).toEqual(["ELECTRICAL", "PLUMBING", "WATER", "SECURITY", "OTHER"]);
    for (const c of ["ELECTRICAL", "PLUMBING", "WATER", "SECURITY", "OTHER"]) expect(bucketOf(c)).toBe(c);
    for (const c of ["GAS", "LIFT", "PAINT", "CLEANING", "SOMETHING_NEW"]) expect(bucketOf(c)).toBe("OTHER");
    expect(maintenanceListQuery.safeParse({ category: "WATER" }).success).toBe(true);
    expect(maintenanceListQuery.safeParse({ category: "GAS" }).success).toBe(false);
  });
});
