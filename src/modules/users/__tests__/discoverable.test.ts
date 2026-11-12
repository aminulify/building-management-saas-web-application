import { describe, expect, it } from "vitest";
import { discoverableWhere, isDiscoverable, isProfileComplete, profileGaps } from "../discoverable";

const full = { fullName: "Rahim", phone: "01711111111", email: "r@x.com", nid: "1990123456789", dateOfBirth: new Date("1990-01-01"), occupation: "Service", addressId: "a1" };

describe("who an owner may find", () => {
  it("a complete profile has no gaps", () => {
    expect(profileGaps(full)).toEqual([]);
    expect(isProfileComplete(full)).toBe(true);
  });
  it("each empty part is a gap", () => {
    expect(profileGaps({ ...full, nid: null })).toEqual(["nid"]);
    expect(profileGaps({ ...full, dateOfBirth: null, occupation: "  " })).toEqual(["dateOfBirth", "occupation"]);
    expect(profileGaps({ ...full, addressId: null })).toEqual(["address"]);
    expect(profileGaps(null)).toContain("address");
  });
  it("found only when verified AND complete", () => {
    expect(isDiscoverable({ ...full, verificationStatus: "VERIFIED" })).toBe(true);
    for (const v of ["UNVERIFIED", "PENDING", "REJECTED"]) expect(isDiscoverable({ ...full, verificationStatus: v })).toBe(false);
    expect(isDiscoverable({ ...full, nid: null, verificationStatus: "VERIFIED" })).toBe(false);
    expect(isDiscoverable(null)).toBe(false);
  });
  it("the database filter asks for the same things", () => {
    expect(discoverableWhere.verificationStatus).toBe("VERIFIED");
    for (const k of ["nid", "dateOfBirth", "occupation", "addressId", "phone", "email"] as const) expect(discoverableWhere[k]).toEqual({ not: null });
  });
});
