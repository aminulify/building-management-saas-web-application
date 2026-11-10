import { describe, expect, it } from "vitest";
import { findPlaces, normalizeText, parseQuery, placeKey } from "../ai-parser";
import { visitHourOk } from "../visits.service";

describe("parseQuery (English)", () => {
  it("understands the example sentence from the design", () => {
    const p = parseQuery("3 bed flat near hospital in Keraniganj under 30k BDT");
    expect(p.bedrooms).toBe(3);
    expect(p.categories).toEqual(["FLAT", "APARTMENT"]);
    expect(p.nearby).toEqual(["HOSPITAL"]);
    expect(p.maxPrice).toBe(30000);
    expect(p.minPrice).toBeUndefined();
  });
  it("reads many ways of writing a budget", () => {
    expect(parseQuery("flat below 25,000 tk").maxPrice).toBe(25000);
    expect(parseQuery("max 1.5 lakh").maxPrice).toBe(150000);
    expect(parseQuery("2 bedroom up to 20 thousand").maxPrice).toBe(20000);
    expect(parseQuery("rent above 40k").minPrice).toBe(40000);
    const r = parseQuery("between 20k and 30k");
    expect([r.minPrice, r.maxPrice]).toEqual([20000, 30000]);
    expect(parseQuery("25000 tk flat").maxPrice).toBe(25000);
  });
  it("does not mistake bedrooms for money", () => {
    const p = parseQuery("2-3 bedrooms near park");
    expect(p.maxPrice).toBeUndefined();
    expect(p.nearby).toEqual(["PARK"]);
  });
  it("finds amenities, furnishing, type, mode and sort", () => {
    const p = parseQuery("furnished duplex with parking and security guard, cheapest, to buy");
    expect(p.furnishing).toBe("FURNISHED");
    expect(p.categories).toEqual(["DUPLEX"]);
    expect(p.amenities).toEqual(expect.arrayContaining(["PARKING", "SECURITY"]));
    expect(p.sort).toBe("price_asc");
    expect(parseQuery("buy a flat").type).toBe("SALE");
    expect(parseQuery("flat for rent").type).toBe("RENT");
  });
  it("tells semi-furnished and unfurnished apart", () => {
    expect(parseQuery("semi furnished flat").furnishing).toBe("SEMI_FURNISHED");
    expect(parseQuery("unfurnished flat").furnishing).toBe("UNFURNISHED");
  });
  it("a sentence with nothing useful gives no filters", () => {
    const p = parseQuery("hello there");
    expect(p.bedrooms).toBeUndefined();
    expect(p.maxPrice).toBeUndefined();
    expect(p.nearby).toEqual([]);
  });
});

describe("parseQuery (Bangla)", () => {
  it("reads Bangla digits and words", () => {
    const p = parseQuery("৩ বেডরুম ফ্ল্যাট হাসপাতালের কাছে ৩০ হাজার টাকার মধ্যে");
    expect(p.bedrooms).toBe(3);
    expect(p.nearby).toEqual(["HOSPITAL"]);
    expect(p.maxPrice).toBe(30000);
    expect(p.categories).toEqual(["FLAT", "APARTMENT"]);
  });
  it("reads lakh and parking", () => {
    const p = parseQuery("পার্কিং সহ ১ লাখ টাকা পর্যন্ত");
    expect(p.amenities).toContain("PARKING");
    expect(normalizeText("৳২৫,০০০")).toContain("25,000");
  });
});

describe("parseQuery (land and sale prices)", () => {
  it("reads crore and lakh sale prices", () => {
    expect(parseQuery("flat under 1.5 crore").maxPrice).toBe(15_000_000);
    expect(parseQuery("৫০ লাখ টাকার মধ্যে ফ্ল্যাট কিনতে চাই").maxPrice).toBe(5_000_000);
    expect(parseQuery("২ কোটি টাকার মধ্যে").maxPrice).toBe(20_000_000);
  });
  it("understands land, its kind and its size", () => {
    const p = parseQuery("residential land 5 katha in Savar under 80 lakh");
    expect(p.categories).toEqual(["LAND"]);
    expect(p.landType).toBe("RESIDENTIAL");
    expect([p.area, p.areaUnit]).toEqual([5, "KATHA"]);
    expect(p.maxPrice).toBe(8_000_000);
  });
  it("reads Bangla land words", () => {
    const p = parseQuery("সাভারে ১০ শতক আবাসিক জমি");
    expect(p.categories).toEqual(["LAND"]);
    expect(p.landType).toBe("RESIDENTIAL");
    expect([p.area, p.areaUnit]).toEqual([10, "DECIMAL"]);
  });
  it("a commercial plot is land, not a commercial flat", () => {
    const p = parseQuery("commercial plot");
    expect(p.categories).toEqual(["LAND"]);
    expect(p.landType).toBe("COMMERCIAL");
  });
});

describe("place matching", () => {
  const known = { division: ["Dhaka"], district: ["Dhaka", "Gazipur"], upazila: ["Keraniganj", "Savar"], unionName: ["Hazratpur", "Birulia"] };
  it("matches names with small spelling differences", () => {
    expect(placeKey("Keraniganj")).toBe(placeKey("keranigonj"));
    expect(findPlaces("3 bed near hospital in keranigonj", known).upazila).toBe("Keraniganj");
    expect(findPlaces("flat in Savar under 20k", known).upazila).toBe("Savar");
    expect(findPlaces("somewhere in hazratpur", known).unionName).toBe("Hazratpur");
  });
  it("finds a place in the middle of a sentence", () => {
    expect(findPlaces("3 bed flat near hospital in Keraniganj under 30k BDT", known).upazila).toBe("Keraniganj");
  });
  it("returns nothing for unknown places", () => {
    expect(findPlaces("flat in Atlantis", known)).toEqual({ division: undefined, district: undefined, upazila: undefined, unionName: undefined });
  });
});

describe("visiting hours", () => {
  it("allows 08:00–21:00 Bangladesh time only", () => {
    expect(visitHourOk(new Date("2026-11-20T04:00:00Z"))).toBe(true); // 10:00 BST
    expect(visitHourOk(new Date("2026-11-20T17:00:00Z"))).toBe(false); // 23:00 BST
    expect(visitHourOk(new Date("2026-11-20T00:30:00Z"))).toBe(false); // 06:30 BST
  });
});
