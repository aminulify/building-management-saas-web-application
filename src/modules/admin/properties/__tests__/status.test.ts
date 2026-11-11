import { AMENITY_CODES, allAmenities, amenitiesSchema } from "../amenities";
import { describe, expect, it } from "vitest";
import { adminCreatePropertySchema, adminPropertiesQuery, setStateSchema } from "../service";
import { occupancyRate, propertyState, STATE_FIELDS } from "../status";

describe("property state", () => {
  it("approved + running = Active", () => expect(propertyState({ status: "ACTIVE", verificationStatus: "VERIFIED" })).toBe("ACTIVE"));
  it("not yet approved = Pending", () => {
    expect(propertyState({ status: "ACTIVE", verificationStatus: "UNVERIFIED" })).toBe("PENDING");
    expect(propertyState({ status: "ACTIVE", verificationStatus: "PENDING" })).toBe("PENDING");
  });
  it("refused and switched-off properties are not Active or Pending", () => {
    expect(propertyState({ status: "ACTIVE", verificationStatus: "REJECTED" })).toBe("REJECTED");
    expect(propertyState({ status: "SUSPENDED", verificationStatus: "VERIFIED" })).toBe("SUSPENDED");
    expect(propertyState({ status: "INACTIVE", verificationStatus: "PENDING" })).toBe("SUSPENDED");
  });
  it("the fields a chosen state writes read back as the same state", () => {
    expect(propertyState(STATE_FIELDS.ACTIVE)).toBe("ACTIVE");
    expect(propertyState(STATE_FIELDS.PENDING)).toBe("PENDING");
  });
});

describe("occupancy rate", () => {
  it("is occupied ÷ total × 100, one decimal", () => {
    expect(occupancyRate(11, 12)).toBe(91.7);
    expect(occupancyRate(9, 10)).toBe(90);
    expect(occupancyRate(0, 12)).toBe(0);
  });
  it("is 0 with no units and never above 100", () => {
    expect(occupancyRate(0, 0)).toBe(0);
    expect(occupancyRate(5, 4)).toBe(100);
  });
});

describe("admin properties input", () => {
  it("table query: 3 tabs, 9 rows by default, page size capped", () => {
    expect(adminPropertiesQuery.parse({})).toEqual({ tab: "all", limit: 9 });
    expect(adminPropertiesQuery.safeParse({ tab: "deleted" }).success).toBe(false);
    expect(adminPropertiesQuery.safeParse({ limit: "99" }).success).toBe(false);
  });
  it("status change only accepts Active or Pending (delete is its own call)", () => {
    expect(setStateSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
    expect(setStateSchema.safeParse({ status: "PENDING" }).success).toBe(true);
    expect(setStateSchema.safeParse({ status: "DELETE" }).success).toBe(false);
    expect(setStateSchema.safeParse({ status: "SUSPENDED" }).success).toBe(false);
  });
  it("a new property needs an owner id and a place", () => {
    const ok = { ownerId: "0192f2c4-1b7e-7a3c-8d11-5d6f0a0c1111", name: "Shanti Nibash", locationText: "Mirpur DOHS, Dhaka", declaredUnits: 12 };
    expect(adminCreatePropertySchema.safeParse(ok).success).toBe(true);
    expect(adminCreatePropertySchema.safeParse({ ...ok, ownerId: "x" }).success).toBe(false);
    expect(adminCreatePropertySchema.safeParse({ ...ok, locationText: undefined }).success).toBe(false);
  });
});

describe("amenities", () => {
  it("offers the 14 choices of the form, with Near School once", () => {
    expect(AMENITY_CODES).toHaveLength(14);
    expect(new Set(AMENITY_CODES).size).toBe(14);
  });
  it("accepts any mix with one furnishing option and drops repeats", () => {
    expect(amenitiesSchema.parse(["PARKING", "LIFT", "PARKING", "FURNISHED"])).toEqual(["PARKING", "LIFT", "FURNISHED"]);
    expect(amenitiesSchema.parse(undefined)).toEqual([]);
  });
  it("rejects two furnishing options and unknown codes", () => {
    expect(amenitiesSchema.safeParse(["FURNISHED", "SEMI_FURNISHED"]).success).toBe(false);
    expect(amenitiesSchema.safeParse(["SWIMMING_POOL"]).success).toBe(false);
  });
  it("older security features count as the matching amenity", () => {
    expect(allAmenities(["PARKING"], ["GATED", "GUARD_24_7", "FIRE_ALARM"])).toEqual(["PARKING", "SECURITY", "GATED_COMMUNITY"]);
  });
  it("is part of the admin create schema", () => {
    const ok = { ownerId: "0192f2c4-1b7e-7a3c-8d11-5d6f0a0c1111", name: "Shanti Nibash", locationText: "Mirpur DOHS, Dhaka", declaredUnits: 12, amenities: ["MOSQUE", "CCTV"] };
    expect(adminCreatePropertySchema.parse(ok).amenities).toEqual(["MOSQUE", "CCTV"]);
    expect(adminCreatePropertySchema.safeParse({ ...ok, amenities: ["NOPE"] }).success).toBe(false);
  });
});
