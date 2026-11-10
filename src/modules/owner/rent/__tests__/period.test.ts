import { describe, expect, it } from "vitest";
import { currentMonth, FIRST_YEAR, isValidMonth, monthLabel, monthName, monthOptions } from "../period";

describe("month dropdown", () => {
  it("covers every month from 2024 to 2026, newest first", () => {
    const groups = monthOptions(new Date("2026-11-10T00:00:00Z"));
    expect(groups.map((g) => g.year)).toEqual([2026, 2025, 2024]);
    expect(groups.flatMap((g) => g.months)).toHaveLength(36);
    expect(groups[0]!.months[0]).toBe("2026-12");
    expect(groups[2]!.months.at(-1)).toBe("2024-01");
  });
  it("grows with the calendar after 2026", () => {
    expect(monthOptions(new Date("2027-03-01T00:00:00Z"))[0]!.year).toBe(2027);
  });
  it("validates month strings", () => {
    expect(isValidMonth("2026-11")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2023-12")).toBe(false);
    expect(FIRST_YEAR).toBe(2024);
  });
  it("labels months in both languages", () => {
    expect(monthLabel("en", "2026-11")).toBe("November 2026");
    expect(monthName("en", "2026-11")).toBe("November");
    expect(monthLabel("bn", "2026-11")).toContain("২০২৬");
  });
  it("currentMonth is YYYY-MM in UTC", () => {
    expect(currentMonth(new Date("2026-03-31T23:59:00Z"))).toBe("2026-03");
  });
});
