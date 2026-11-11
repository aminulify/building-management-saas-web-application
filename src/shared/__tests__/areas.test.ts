import { describe, expect, it } from "vitest";
import { AREA_BASE, areaOfPath, baseOf, landingOf, moveToArea } from "../areas";

describe("role → URL area", () => {
  it("every role has exactly its own base", () => {
    expect(AREA_BASE).toEqual({ OWNER: "/home-owner", TENANT: "/tenant", GENERAL_USER: "/tenant-free" });
    expect(baseOf("OWNER")).toBe("/home-owner");
    expect(baseOf("TENANT")).toBe("/tenant");
    expect(baseOf("GENERAL_USER")).toBe("/tenant-free");
    expect(baseOf("SUPER_ADMIN")).toBeNull();
    expect(baseOf(undefined)).toBeNull();
  });
  it("tells the area of a path, with or without the language prefix, and never confuses tenant with tenant-free", () => {
    expect(areaOfPath("/tenant/history")).toBe("/tenant");
    expect(areaOfPath("/en/tenant-free/history")).toBe("/tenant-free");
    expect(areaOfPath("/bn/home-owner/rent")).toBe("/home-owner");
    expect(areaOfPath("/tenant")).toBe("/tenant");
    expect(areaOfPath("/tenant-free")).toBe("/tenant-free");
    expect(areaOfPath("/tenants")).toBeNull();
    expect(areaOfPath("/owner/rent")).toBeNull(); // the old address is only a redirect now
    expect(areaOfPath("/account")).toBeNull();
  });
  it("moves the same page to another area and keeps the rest of the path", () => {
    expect(moveToArea("/tenant/history", "/tenant-free")).toBe("/tenant-free/history");
    expect(moveToArea("/tenant-free/marketplace", "/tenant")).toBe("/tenant/marketplace");
    expect(moveToArea("/en/tenant/maintenance", "/tenant-free")).toBe("/en/tenant-free/maintenance");
    expect(moveToArea("/tenant/history", "/tenant")).toBe("/tenant/history");
    expect(moveToArea("/account", "/tenant")).toBe("/account");
  });
  it("lands each role on its own dashboard", () => {
    expect(landingOf("OWNER")).toBe("/home-owner/dashboard");
    expect(landingOf("TENANT")).toBe("/tenant/dashboard");
    expect(landingOf("GENERAL_USER")).toBe("/tenant-free/dashboard");
    expect(landingOf("GOV_ADMIN")).toBe("/account");
  });
});
