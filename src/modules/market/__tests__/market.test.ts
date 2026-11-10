import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, toQuery } from "../../find-home/filters";
import { priceBadge } from "../price";
import { buildPayload, emptySell, firstBadStep, parseCoords, validateSell, validateStep, type SellValues } from "../sell-form";

const place = (name: string) => ({ id: "1", name, bnName: name });
const valid = (): SellValues => ({
  ...emptySell("APARTMENT"), title: "3BHK Luxury Apartment", description: "Spacious flat with an open view, lift and generator backup.", price: "6500000", condition: "NEW",
  area: "1350", bedrooms: "3", division: place("Dhaka"), district: place("Dhaka"), upazila: place("Keraniganj"), declaration: true,
});

describe("price badge", () => {
  it("says crore, lakh and rent the way people read them", () => {
    expect(priceBadge("en", 12_500_000, "SALE")).toEqual({ text: "৳ 1.25", suffix: " Crore" });
    expect(priceBadge("en", 8_500_000, "SALE")).toEqual({ text: "৳ 85", suffix: " Lakh" });
    expect(priceBadge("en", 35_000, "RENT")).toEqual({ text: "৳ 35,000", suffix: "/mo" });
    expect(priceBadge("en", 75_000, "SALE")).toEqual({ text: "৳ 75,000", suffix: "" });
  });
  it("uses Bangla digits and words in the Bangla UI", () => {
    expect(priceBadge("bn", 12_500_000, "SALE")).toEqual({ text: "৳ ১.২৫", suffix: " কোটি" });
    expect(priceBadge("bn", 35_000, "RENT")).toEqual({ text: "৳ ৩৫,০০০", suffix: "/মাস" });
  });
});

describe("map point", () => {
  it("reads plain coordinates and Google Maps links", () => {
    expect(parseCoords("23.8103, 90.4125")).toEqual({ lat: 23.8103, lng: 90.4125 });
    expect(parseCoords("https://www.google.com/maps/@23.7036,90.3722,17z")).toEqual({ lat: 23.7036, lng: 90.3722 });
    expect(parseCoords("https://maps.google.com/?q=23.81,90.41")).toEqual({ lat: 23.81, lng: 90.41 });
    expect(parseCoords("https://www.google.com/maps/place/x/data=!3d23.75!4d90.39")).toEqual({ lat: 23.75, lng: 90.39 });
  });
  it("rejects nonsense and out-of-range points", () => {
    expect(parseCoords("hello")).toBeNull();
    expect(parseCoords("123.4, 90.4")).toBeNull();
  });
});

describe("create-listing form", () => {
  it("accepts a complete flat", () => {
    expect(validateSell(valid())).toEqual({});
  });
  it("checks only the step you are on", () => {
    const v = { ...valid(), title: "", division: null };
    expect(Object.keys(validateStep(v, "basics"))).toEqual(["title"]);
    expect(Object.keys(validateStep(v, "location"))).toEqual(["division"]);
    expect(validateStep(v, "details")).toEqual({});
  });
  it("needs bedrooms for a flat, and a size for land", () => {
    expect(validateSell({ ...valid(), bedrooms: "" }).bedrooms).toBe("bedroomsRequired");
    const land = { ...valid(), category: "LAND", bedrooms: "", area: "" };
    expect(validateSell(land).area).toBe("areaRequired");
    expect(validateSell(land).bedrooms).toBeUndefined();
  });
  it("needs the condition, a real price and a declaration", () => {
    expect(validateSell({ ...valid(), condition: "" }).condition).toBe("conditionRequired");
    expect(validateSell({ ...valid(), price: "0" }).price).toBe("priceInvalid");
    expect(validateSell({ ...valid(), declaration: false }).declaration).toBe("declaration");
  });
  it("wants both coordinates or none", () => {
    expect(validateSell({ ...valid(), lat: "23.8" }).lat).toBe("coordsTogether");
    expect(validateSell({ ...valid(), lat: "923", lng: "90" }).lat).toBe("coordsInvalid");
  });
  it("jumps back to the earliest step with a problem", () => {
    expect(firstBadStep({ upazila: "placeRequired", title: "titleShort" })).toBe("basics");
    expect(firstBadStep({ upazila: "placeRequired" })).toBe("location");
    expect(firstBadStep({})).toBeNull();
  });
  it("builds the API body: sale or rent, place names, zone, no flat fields for land", () => {
    const p = buildPayload({ ...valid(), mode: "RENT", zoneId: "z1", union: place("Hazratpur"), amenities: ["SECURITY", "PARK"] });
    expect(p).toMatchObject({ type: "RENT", category: "APARTMENT", price: 6500000, bedrooms: 3, area: 1350, areaUnit: "SQFT", zoneId: "z1", division: "Dhaka", upazila: "Keraniganj", unionName: "Hazratpur", condition: "NEW", amenities: ["SECURITY", "PARK"] });
    const land = buildPayload({ ...valid(), category: "LAND", areaUnit: "KATHA", landType: "RESIDENTIAL", roadWidthFt: "30" });
    expect(land.landDetails).toEqual({ landType: "RESIDENTIAL", roadWidthFt: 30, plotNo: undefined, mouza: undefined });
    expect("bedrooms" in land).toBe(false);
  });
});

describe("marketplace search query", () => {
  it("sends the search text, zone, page size and amenities", () => {
    const q = new URLSearchParams(toQuery({ ...EMPTY_FILTERS, mode: "SALE", q: " OW10034 ", zoneId: "z9", amenities: ["SECURITY", "SCHOOL"], category: "BUILDING" }, null, 6));
    expect(Object.fromEntries(q)).toEqual({ type: "SALE", limit: "6", sort: "newest", q: "OW10034", zoneId: "z9", categories: "BUILDING", amenities: "SECURITY,SCHOOL" });
  });
});
