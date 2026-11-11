import { describe, expect, it } from "vitest";
import { BEHAVIORS, BEHAVIOR_STYLE, editRecordSchema, recordPatch, stayDuration, statementFileName } from "../logic";

describe("how long they stayed", () => {
  it("counts the first and the last day", () => {
    expect(stayDuration("2023-11-02", "2024-01-30")).toEqual({ years: 0, months: 2, days: 29 });
    expect(stayDuration("2024-01-01", "2024-01-31")).toEqual({ years: 0, months: 1, days: 0 });
    expect(stayDuration("2024-05-10", "2024-05-10")).toEqual({ years: 0, months: 0, days: 1 });
  });
  it("splits into years and months", () => {
    expect(stayDuration("2022-11-02", "2025-01-30")).toEqual({ years: 2, months: 2, days: 29 });
    expect(stayDuration("2023-07-02", "2024-06-30")).toEqual({ years: 0, months: 11, days: 29 });
    expect(stayDuration("2022-02-02", "2023-01-30")).toEqual({ years: 0, months: 11, days: 29 });
  });
});

describe("rating badge", () => {
  it("every rating has its own colours; Good is green, Average blue, Ugly yellow, Very Bad red", () => {
    expect(BEHAVIORS).toHaveLength(6);
    expect(new Set(BEHAVIORS.map((b) => BEHAVIOR_STYLE[b])).size).toBe(6);
    expect(BEHAVIOR_STYLE.GOOD).toContain("green");
    expect(BEHAVIOR_STYLE.AVERAGE).toContain("sky");
    expect(BEHAVIOR_STYLE.UGLY).toContain("yellow");
    expect(BEHAVIOR_STYLE.VERY_BAD).toContain("red");
  });
});

describe("edit form", () => {
  const ok = { leaveReason: "JOB_TRANSFER", behavior: "GOOD", startDate: "2023-11-02", endDate: "2024-01-30", ownerNotes: "" } as const;
  it("accepts a good record, with an empty rating or reason", () => {
    expect(editRecordSchema.safeParse(ok).success).toBe(true);
    expect(editRecordSchema.safeParse({ ...ok, leaveReason: "", behavior: "" }).success).toBe(true);
  });
  it("needs both dates, and the end after the start", () => {
    expect(editRecordSchema.safeParse({ ...ok, endDate: "" }).error?.issues[0]?.message).toBe("leaseDateRequired");
    expect(editRecordSchema.safeParse({ ...ok, startDate: "" }).error?.issues[0]?.message).toBe("entryDateRequired");
    expect(editRecordSchema.safeParse({ ...ok, endDate: "2023-11-02" }).error?.issues[0]?.message).toBe("leaseAfterEntry");
  });
  it("notes are limited to 1000 letters", () => { expect(editRecordSchema.safeParse({ ...ok, ownerNotes: "x".repeat(1001) }).success).toBe(false); });
});

describe("what is sent when saving", () => {
  const before = { startDate: "2023-11-02T00:00:00.000Z", endDate: "2024-01-30T00:00:00.000Z", leaveReason: "JOB_TRANSFER", behavior: "GOOD", ownerNotes: null };
  const same = { leaveReason: "JOB_TRANSFER", behavior: "GOOD", startDate: "2023-11-02", endDate: "2024-01-30", ownerNotes: "" } as const;
  it("nothing changed → nothing sent", () => { expect(recordPatch(same, before)).toEqual({}); });
  it("only the changed fields", () => { expect(recordPatch({ ...same, behavior: "BAD", endDate: "2024-02-10" }, before)).toEqual({ behavior: "BAD", endDate: "2024-02-10" }); });
  it("an emptied rating, reason or note is sent as null so it can be cleared", () => {
    expect(recordPatch({ ...same, behavior: "", leaveReason: "" }, before)).toEqual({ behavior: null, leaveReason: null });
    expect(recordPatch({ ...same, ownerNotes: "  " }, { ...before, ownerNotes: "old" })).toEqual({ ownerNotes: null });
    expect(recordPatch({ ...same, ownerNotes: " new " }, before)).toEqual({ ownerNotes: "new" });
  });
});

describe("statement file name", () => {
  it("safe letters and the month they left", () => {
    expect(statementFileName("Rahim Uddin Chowdhury", "2024-01-30T00:00:00Z")).toBe("tenant-statement-rahim-uddin-chowdhury-2024-01.pdf");
    expect(statementFileName("রহিম", null)).toBe("tenant-statement-tenant.pdf");
  });
});
