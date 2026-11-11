import { describe, expect, it } from "vitest";
import { formFrom, profileFormSchema, profilePatch, statusKey } from "../logic";
import type { TenantOverview } from "../types";

const base: TenantOverview = {
  user: { id: "u", username: "fahad11", tenantCode: "TF100001", role: "GENERAL_USER", fullName: "Rahim Uddin", email: "rahim@example.com", phone: "01712345678", occupation: "Engineer", dateOfBirth: "1995-08-15T00:00:00.000Z", nid: "1990269154823", members: 4, memberSince: "2026-01-01T00:00:00Z", verificationStatus: "UNVERIFIED", avatarUrl: null },
  tenancy: null,
  address: { division: "Chittagong", district: "Comilla", upazila: "Muradnagar", union: "South Keranigonj", street: "203 House, Block-A", postOffice: "Doshani Bazar" },
  documents: { nidFront: null, nidBack: null, agreement: null },
};

describe("tenant profile form", () => {
  it("starts from what the server has", () => {
    const f = formFrom(base);
    expect(f).toMatchObject({ fullName: "Rahim Uddin", phone: "01712345678", members: "4", dateOfBirth: "1995-08-15", division: "Chittagong", street: "203 House, Block-A" });
    expect(profileFormSchema.safeParse(f).success).toBe(true);
  });
  it("sends nothing when nothing changed", () => {
    expect(profilePatch(formFrom(base), base)).toEqual({});
  });
  it("sends only what changed, with the member count inside `tenant` and the address as one block", () => {
    const f = { ...formFrom(base), fullName: " Amim Uddin ", phone: "+880 1812-345678", members: "5", street: "New road", email: "NEW@Example.com" };
    expect(profilePatch(f, base)).toEqual({
      fullName: "Amim Uddin", phone: "01812345678", email: "new@example.com", tenant: { members: 5 },
      address: { division: "Chittagong", district: "Comilla", upazila: "Muradnagar", union: "South Keranigonj", street: "New road", postOffice: "Doshani Bazar" },
    });
  });
  it("never sends the Tenant ID (it is locked)", () => {
    const f = { ...formFrom(base), tenantCode: "TF999999" } as never;
    expect(JSON.stringify(profilePatch(f, base))).not.toContain("TF9");
  });
  it("rejects bad values with translation keys", () => {
    const keys = (patch: object) => profileFormSchema.safeParse({ ...formFrom(base), ...patch }).error?.issues.map((i) => i.message);
    expect(keys({ phone: "123" })).toContain("phoneInvalid");
    expect(keys({ email: "nope" })).toContain("emailInvalid");
    expect(keys({ nid: "12345" })).toContain("nidFormat");
    expect(keys({ members: "0" })).toContain("membersInvalid");
    expect(keys({ members: "31" })).toContain("membersInvalid");
    expect(keys({ dateOfBirth: "2999-01-01" })).toContain("dobInvalid");
    expect(keys({ division: "" })).toContain("divisionRequired");
  });
  it("shows Tenant Free until an owner connects the person", () => {
    expect(statusKey("GENERAL_USER")).toBe("free");
    expect(statusKey("TENANT")).toBe("verified");
  });
});
