import { describe, expect, it } from "vitest";
import { CROP_SIZE, checkFile, clampOffset, coverScale, donut, formatDob, profileFormSchema, profilePatch, sourceRect } from "../logic";

describe("photo crop", () => {
  it("the image first covers the circle, then zooms", () => {
    expect(coverScale(1000, 500, 1)).toBe(CROP_SIZE / 500);
    expect(coverScale(1000, 500, 2)).toBe((CROP_SIZE / 500) * 2);
  });
  it("cannot be dragged so far that an empty edge shows", () => {
    // 1000x500 at zoom 1: scaled to 512x256, so it can move 128px left or right but not up or down
    expect(clampOffset(1000, 500, 1, 999, 999)).toEqual({ x: 128, y: 0 });
    expect(clampOffset(1000, 500, 1, -999, -999)).toEqual({ x: -128, y: 0 });
    expect(clampOffset(1000, 500, 2, 50, 20)).toEqual({ x: 50, y: 20 });
  });
  it("the saved part is the square inside the circle", () => {
    const r = sourceRect(1000, 500, 1, 0, 0);
    expect(r.size).toBe(500);
    expect(r.sx).toBe(250);
    expect(r.sy).toBe(0);
    const left = sourceRect(1000, 500, 1, 128, 0); // picture dragged right → we see its left edge
    expect(left.sx).toBe(0);
    const zoomed = sourceRect(1000, 500, 2, 0, 0);
    expect(zoomed.size).toBe(250);
    expect(zoomed.sx).toBe(375);
    expect(zoomed.sy).toBe(125);
  });
  it("a square picture never leaves the frame", () => {
    const r = sourceRect(300, 300, 1, 40, -40);
    expect(r.sx).toBe(0);
    expect(r.size).toBe(300);
  });
});

describe("donut", () => {
  it("occupied, vacant and the share", () => {
    expect(donut(24, 18)).toEqual({ occupied: 18, vacant: 6, frac: 0.75, percent: 75 });
    expect(donut(0, 0)).toMatchObject({ vacant: 0, frac: 0, percent: 0 });
    expect(donut(5, 9)).toMatchObject({ occupied: 5, vacant: 0, percent: 100 });
  });
});

describe("files", () => {
  it("type and size are checked", () => {
    expect(checkFile({ type: "image/png", size: 1000 }, ["image/png"], 5)).toBeNull();
    expect(checkFile({ type: "application/zip", size: 1000 }, ["image/png"], 5)).toBe("type");
    expect(checkFile({ type: "image/png", size: 6 * 1024 * 1024 }, ["image/png"], 5)).toBe("size");
  });
});

describe("date of birth", () => {
  it("shown like 15 AUG 1990", () => {
    expect(formatDob("en", "1990-08-15T00:00:00.000Z")).toBe("15 AUG 1990");
    expect(formatDob("en", null)).toBe("—");
    expect(formatDob("bn", "1990-08-15T00:00:00.000Z")).toContain("১৯৯০");
  });
});

describe("update profile form", () => {
  const ok = { fullName: "Faruk Ahmed", phone: "01712345678", occupation: "Businessman", dateOfBirth: "1990-08-15", division: "Chattogram", district: "Cumilla", upazila: "", union: "", street: "", postOffice: "" };
  it("accepts a good form", () => { expect(profileFormSchema.safeParse(ok).success).toBe(true); });
  it("checks name, Bangladesh phone, birth date and the two required address lines", () => {
    expect(profileFormSchema.safeParse({ ...ok, fullName: "F" }).error?.issues[0]?.message).toBe("nameLength");
    expect(profileFormSchema.safeParse({ ...ok, phone: "12345" }).error?.issues[0]?.message).toBe("phoneFormat");
    expect(profileFormSchema.safeParse({ ...ok, dateOfBirth: "2999-01-01" }).error?.issues[0]?.message).toBe("dobFuture");
    expect(profileFormSchema.safeParse({ ...ok, dateOfBirth: "" }).error?.issues[0]?.message).toBe("dobRequired");
    expect(profileFormSchema.safeParse({ ...ok, division: "" }).error?.issues[0]?.message).toBe("divisionRequired");
    expect(profileFormSchema.safeParse({ ...ok, district: "x" }).error?.issues[0]?.message).toBe("districtRequired");
  });
  const before = { fullName: "Faruk Ahmed", phone: "01712345678", occupation: "Businessman", dateOfBirth: "1990-08-15T00:00:00.000Z", address: { division: "Chattogram", district: "Cumilla", upazila: null, union: null, street: null, postOffice: null } };
  it("nothing changed → nothing sent", () => { expect(profilePatch(ok, before)).toEqual({}); });
  it("only changed fields; the address is sent as a block without empty lines", () => {
    expect(profilePatch({ ...ok, occupation: "Engineer" }, before)).toEqual({ occupation: "Engineer" });
    expect(profilePatch({ ...ok, union: " South Keraniganj ", postOffice: "Doshani Bazar" }, before)).toEqual({ address: { division: "Chattogram", district: "Cumilla", union: "South Keraniganj", postOffice: "Doshani Bazar" } });
  });
});
