import { describe, expect, it } from "vitest";
import { canOpen, landingFor, navFor, showsFreePlanCard } from "../nav";

const keys = (role: string) => navFor(role).flat().map((i) => i.key);
const hrefs = (role: string) => navFor(role).flat().map((i) => i.href);

describe("tenant area navigation", () => {
  it("a verified tenant has no Subscription tab and every link is under /tenant", () => {
    expect(keys("TENANT")).not.toContain("subscription");
    expect(keys("TENANT")).toEqual(expect.arrayContaining(["dashboard", "maintenance", "findHome", "marketplace", "history", "notifications", "messages"]));
    expect(hrefs("TENANT").every((h) => h.startsWith("/tenant/"))).toBe(true);
  });
  it("a Tenant-Free account sees everything a verified tenant sees, plus Subscription, all under /tenant-free", () => {
    expect(keys("GENERAL_USER")).toEqual([...keys("TENANT").slice(0, 5), "subscription", ...keys("TENANT").slice(5)]);
    expect(keys("GENERAL_USER").filter((k) => !keys("TENANT").includes(k))).toEqual(["subscription"]);
    expect(hrefs("GENERAL_USER").every((h) => h.startsWith("/tenant-free/"))).toBe(true);
    expect(hrefs("GENERAL_USER")).toContain("/tenant-free/subscription");
  });
  it("each role may open only the pages inside its own area", () => {
    for (const p of ["dashboard", "maintenance", "find-home", "marketplace", "history", "notifications", "messages"]) {
      expect(canOpen("GENERAL_USER", `/tenant-free/${p}`)).toBe(true);
      expect(canOpen("TENANT", `/tenant/${p}`)).toBe(true);
      expect(canOpen("GENERAL_USER", `/tenant/${p}`)).toBe(false); // wrong area for this role
      expect(canOpen("TENANT", `/tenant-free/${p}`)).toBe(false);
    }
    expect(canOpen("GENERAL_USER", "/tenant-free/subscription")).toBe(true);
    expect(canOpen("TENANT", "/tenant/subscription")).toBe(false);
    expect(canOpen("TENANT", "/tenant/marketplace/anything")).toBe(true);
    expect(canOpen("OWNER", "/tenant/dashboard")).toBe(false);
  });
  it("the profile page (badge at the bottom of the sidebar) is part of each role's own area only", () => {
    expect(canOpen("GENERAL_USER", "/tenant-free/profile")).toBe(true);
    expect(canOpen("TENANT", "/tenant/profile")).toBe(true);
    expect(canOpen("TENANT", "/tenant-free/profile")).toBe(false);
    expect(canOpen("GENERAL_USER", "/tenant/profile")).toBe(false);
  });
  it("the Free Plan card (Upgrade Now) is only for Tenant-Free accounts, and Upgrade Now leads to a page they may open", () => {
    expect(showsFreePlanCard("GENERAL_USER")).toBe(true);
    expect(showsFreePlanCard("TENANT")).toBe(false);
    expect(showsFreePlanCard("OWNER")).toBe(false);
    expect(canOpen("GENERAL_USER", "/tenant-free/subscription")).toBe(true);
  });
  it("each role lands on the dashboard of its own area", () => {
    expect(landingFor("GENERAL_USER")).toBe("/tenant-free/dashboard");
    expect(landingFor("TENANT")).toBe("/tenant/dashboard");
    expect(landingFor("OWNER")).toBe("/home-owner/dashboard");
  });
});
