import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, activeCount, cleanAmount, filtersFromAi, priceRangeInvalid, resolvePlaces, toQuery, toggle } from "../filters";
import { SLOTS, toBdIso } from "../visit-time";
import type { AiResponse, GeoItem } from "../types";

const geo = (id: string, name: string): GeoItem => ({ id, name, bnName: name });

describe("toQuery", () => {
  it("starts with just mode, page size and sort", () => {
    expect(toQuery(EMPTY_FILTERS)).toBe("type=RENT&limit=9&sort=newest");
  });
  it("sends place names exactly as the geo API spells them", () => {
    const q = new URLSearchParams(toQuery({ ...EMPTY_FILTERS, division: geo("6", "Dhaka"), district: geo("47", "Dhaka"), upazila: geo("367", "Keraniganj"), union: geo("1", "Hazratpur") }));
    expect([q.get("division"), q.get("district"), q.get("upazila"), q.get("unionName")]).toEqual(["Dhaka", "Dhaka", "Keraniganj", "Hazratpur"]);
  });
  it("turns every quick filter into the matching parameter", () => {
    const q = new URLSearchParams(toQuery({ ...EMPTY_FILTERS, mode: "SALE", beds: [3, 2], nearby: ["HOSPITAL", "PARK"], amenities: ["PARKING"], category: "APARTMENT", minPrice: "10000", maxPrice: "30000", furnishing: "FURNISHED", saved: true, sort: "price_asc" }, "cursor-1"));
    expect(Object.fromEntries(q)).toEqual({ type: "SALE", limit: "9", sort: "price_asc", bedroomList: "2,3", nearby: "HOSPITAL,PARK", amenities: "PARKING", categories: "FLAT,APARTMENT", minPrice: "10000", maxPrice: "30000", furnishing: "FURNISHED", saved: "1", cursor: "cursor-1" });
  });
});

describe("price boxes", () => {
  it("keep digits only, also Bangla digits", () => {
    expect(cleanAmount("25,000 tk")).toBe("25000");
    expect(cleanAmount("২৫,০০০")).toBe("25000");
    expect(cleanAmount("abc")).toBe("");
  });
  it("flag a minimum above the maximum", () => {
    expect(priceRangeInvalid({ minPrice: "30000", maxPrice: "20000" })).toBe(true);
    expect(priceRangeInvalid({ minPrice: "20000", maxPrice: "20000" })).toBe(false);
    expect(priceRangeInvalid({ minPrice: "", maxPrice: "20000" })).toBe(false);
  });
});

describe("helpers", () => {
  it("toggle adds and removes", () => {
    expect(toggle([2], 3)).toEqual([2, 3]);
    expect(toggle([2, 3], 2)).toEqual([3]);
  });
  it("activeCount drives the Clear all button", () => {
    expect(activeCount(EMPTY_FILTERS)).toBe(0);
    expect(activeCount({ ...EMPTY_FILTERS, mode: "SALE", sort: "price_desc" })).toBe(0); // mode and sort are not "filters"
    expect(activeCount({ ...EMPTY_FILTERS, division: geo("6", "Dhaka"), beds: [2, 3], nearby: ["PARK"], maxPrice: "1" })).toBe(5);
  });
});

describe("resolvePlaces", () => {
  const tree: Record<string, GeoItem[]> = {
    divisions: [geo("6", "Dhaka"), geo("1", "Chattagram")],
    "districts:6": [geo("47", "Dhaka"), geo("41", "Gazipur")],
    "upazilas:47": [geo("365", "Savar"), geo("367", "Keraniganj")],
    "unions:367": [geo("9", "Hazratpur")],
  };
  const load = async (level: string, parent?: string) => tree[parent ? `${level}:${parent}` : level] ?? [];
  it("turns names back into the ids the dropdowns need", async () => {
    const r = await resolvePlaces({ division: "dhaka", district: "Dhaka", upazila: "KERANIGANJ", unionName: "Hazratpur" }, load as never);
    expect([r.division?.id, r.district?.id, r.upazila?.id, r.union?.id]).toEqual(["6", "47", "367", "9"]);
  });
  it("stops at the first level it cannot find", async () => {
    const r = await resolvePlaces({ division: "Dhaka", district: "Narnia", upazila: "Keraniganj" }, load as never);
    expect([r.division?.id, r.district, r.upazila]).toEqual(["6", null, null]);
  });
  it("survives a failing geo API", async () => {
    const r = await resolvePlaces({ division: "Dhaka" }, (async () => { throw new Error("down"); }) as never);
    expect(r).toEqual({ division: null, district: null, upazila: null, union: null });
  });
});

describe("filtersFromAi", () => {
  const ai: AiResponse["filters"] = { type: "SALE", maxPrice: 30000, bedroomList: [3], categories: ["FLAT", "APARTMENT"], nearby: ["HOSPITAL"], amenities: ["PARKING"], furnishing: "FURNISHED", sort: "price_asc" };
  it("copies the assistant's understanding into the filter card", () => {
    const f = filtersFromAi(ai, { ...EMPTY_FILTERS, saved: true });
    expect(f).toMatchObject({ mode: "SALE", maxPrice: "30000", minPrice: "", beds: [3], category: "APARTMENT", nearby: ["HOSPITAL"], amenities: ["PARKING"], furnishing: "FURNISHED", sort: "price_asc", saved: false });
  });
  it("maps duplex / studio / commercial directly", () => {
    expect(filtersFromAi({ ...ai, categories: ["DUPLEX"] }, EMPTY_FILTERS).category).toBe("DUPLEX");
    expect(filtersFromAi({ ...ai, categories: ["COMMERCIAL"] }, EMPTY_FILTERS).category).toBe("COMMERCIAL");
  });
});

describe("visit time", () => {
  it("offers half-hour slots from 08:00 to 20:30", () => {
    expect(SLOTS[0]).toBe("08:00");
    expect(SLOTS[SLOTS.length - 1]).toBe("20:30");
    expect(SLOTS).toHaveLength(26);
  });
  it("reads the chosen time as Bangladesh time (UTC+6)", () => {
    expect(toBdIso("2026-11-20", "15:30")).toBe("2026-11-20T09:30:00.000Z");
    expect(toBdIso("2026-11-20", "08:00")).toBe("2026-11-20T02:00:00.000Z");
  });
});
