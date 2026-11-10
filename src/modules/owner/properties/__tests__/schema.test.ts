import { describe, expect, it } from "vitest";
import { checkPropertyImage, matchesQuery, propertyFormSchema } from "../schema";

const ok = { name: "Dhali Monzil", location: "Keraniganj, Dhaka, Bangladesh", totalSqft: "12000", totalUnits: "20" };

describe("propertyFormSchema", () => {
  it("accepts the sample property", () => expect(propertyFormSchema.safeParse(ok).success).toBe(true));
  it("rejects missing or invalid fields", () => {
    expect(propertyFormSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...ok, location: "ab" }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...ok, totalSqft: "12.5" }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...ok, totalSqft: "0" }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...ok, totalUnits: "abc" }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...ok, totalUnits: "1001" }).success).toBe(false);
  });
});

describe("checkPropertyImage", () => {
  it("allows png/jpeg/webp up to 5 MB", () => {
    expect(checkPropertyImage({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkPropertyImage({ type: "application/pdf", size: 1000 })).toBe("imageType");
    expect(checkPropertyImage({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("imageSize");
    expect(checkPropertyImage({ type: "image/jpeg", size: 0 })).toBe("fileEmpty");
  });
});

describe("matchesQuery", () => {
  const p = { name: "Dhali Monzil", locationLabel: "Keraniganj, Dhaka, Bangladesh" };
  it("matches name or location, ignoring case and spaces around", () => {
    expect(matchesQuery(p, "")).toBe(true);
    expect(matchesQuery(p, "  dhali ")).toBe(true);
    expect(matchesQuery(p, "KERANIGANJ")).toBe(true);
    expect(matchesQuery(p, "gulshan")).toBe(false);
  });
});
