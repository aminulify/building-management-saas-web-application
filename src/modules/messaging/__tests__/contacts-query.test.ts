import { describe, expect, it } from "vitest";
import { CONTACT_ROLES, contactsQuery } from "../schema";

describe("people an admin can browse", () => {
  it("one kind of person: Tenant Free, Tenants, Owners or Government", () => {
    expect([...CONTACT_ROLES]).toEqual(["GENERAL_USER", "TENANT", "OWNER", "GOV_ADMIN"]);
    for (const role of CONTACT_ROLES) expect(contactsQuery.safeParse({ role }).success).toBe(true);
  });
  it("no other kind, and words are optional", () => {
    expect(contactsQuery.safeParse({ role: "SUPER_ADMIN" }).success).toBe(false);
    expect(contactsQuery.safeParse({}).success).toBe(true);
    expect(contactsQuery.safeParse({ q: "rahim", role: "OWNER" }).success).toBe(true);
    expect(contactsQuery.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });
});
