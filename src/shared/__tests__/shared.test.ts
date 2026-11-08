import { describe, expect, it } from "vitest";
import { computePrice } from "../pricing";
import { canCommunicate } from "../can-communicate";
import { PERMISSIONS, scopeFor } from "../permissions";
import { ROLES } from "../roles";

describe("pricing", () => {
  const primary = { monthlyPricePaisa: 15900, quarterlyDiscount: 10, yearlyDiscount: 20 };
  it("matches the architecture table", () => {
    expect(computePrice(primary, "MONTHLY").totalPaisa).toBe(15900);
    expect(computePrice(primary, "QUARTERLY").totalPaisa).toBe(42930);
    expect(computePrice(primary, "YEARLY").totalPaisa).toBe(152640);
    expect(computePrice({ ...primary, monthlyPricePaisa: 69900 }, "YEARLY").totalPaisa).toBe(671040);
  });
  it("reports savings", () => {
    expect(computePrice(primary, "YEARLY").savingsPaisa).toBe(38160);
  });
});

describe("permission matrix", () => {
  it("only super admin manages plans and reviews upgrades", () => {
    for (const r of ROLES) {
      const expected = r === "SUPER_ADMIN" ? "all" : undefined;
      expect(scopeFor(r, "plan:manage")).toBe(expected);
      expect(scopeFor(r, "upgrade:review")).toBe(expected);
    }
  });
  it("tenants never record rent; only tenants pay it", () => {
    expect(scopeFor("TENANT", "rent:record")).toBeUndefined();
    expect(scopeFor("OWNER", "rent:pay")).toBeUndefined();
    expect(scopeFor("TENANT", "rent:pay")).toBe("own");
  });
  it("gov admin listing:create is grantable only", () => {
    expect(scopeFor("GOV_ADMIN", "listing:create")).toBe("grantable");
  });
  it("every role can browse the marketplace", () => {
    for (const r of ROLES) expect(scopeFor(r, "marketplace:browse")).toBe("all");
  });
  it("has no unknown permissions in the matrix", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});

describe("canCommunicate", () => {
  const u = (id: string, role: (typeof ROLES)[number]) => ({ id, role });
  it("super admin can message anyone", () => {
    expect(canCommunicate(u("a", "SUPER_ADMIN"), u("b", "TENANT"))).toBe(true);
  });
  it("tenant ↔ owner needs an active agreement", () => {
    expect(canCommunicate(u("t", "TENANT"), u("o", "OWNER"))).toBe(false);
    expect(canCommunicate(u("t", "TENANT"), u("o", "OWNER"), { hasActiveAgreement: true })).toBe(true);
  });
  it("tenant cannot message gov admin or another tenant", () => {
    expect(canCommunicate(u("t", "TENANT"), u("g", "GOV_ADMIN"))).toBe(false);
    expect(canCommunicate(u("t", "TENANT"), u("t2", "TENANT"))).toBe(false);
  });
  it("gov admin reaches owners, tenants and super admin", () => {
    for (const r of ["OWNER", "TENANT", "SUPER_ADMIN"] as const) {
      expect(canCommunicate(u("g", "GOV_ADMIN"), u("x", r))).toBe(true);
    }
  });
  it("general user only via support or listing inquiry", () => {
    expect(canCommunicate(u("g", "GENERAL_USER"), u("o", "OWNER"))).toBe(false);
    expect(canCommunicate(u("g", "GENERAL_USER"), u("o", "OWNER"), { isListingInquiry: true })).toBe(true);
    expect(canCommunicate(u("g", "GENERAL_USER"), u("s", "SUPER_ADMIN"), { viaSupport: true })).toBe(true);
  });
});
