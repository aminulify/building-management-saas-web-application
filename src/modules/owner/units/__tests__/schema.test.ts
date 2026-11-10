import { describe, expect, it } from "vitest";
import { deriveFloor, isFullPhone, normalizePhone, unitFormSchema } from "../schema";

const ok = { propertyId: "p1", unitNumber: "Unit 101", bedrooms: "2", sqft: "500", rent: "25000", floor: "", bathrooms: "1", diningRooms: "1", kitchens: "1" };

describe("unitFormSchema", () => {
  it("accepts the sample unit", () => expect(unitFormSchema.safeParse(ok).success).toBe(true));
  it("rejects missing or invalid fields", () => {
    expect(unitFormSchema.safeParse({ ...ok, propertyId: "" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, unitNumber: "  " }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, bedrooms: "" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, bedrooms: "6" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, sqft: "49" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, sqft: "5.5" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, rent: "0" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, rent: "12.345" }).success).toBe(false);
    expect(unitFormSchema.safeParse({ ...ok, rent: "25000.50" }).success).toBe(true);
  });
});

describe("deriveFloor", () => {
  it("reads the floor from the unit name", () => {
    expect(deriveFloor("Unit 101", 5)).toBe(1);
    expect(deriveFloor("Unit 302", 5)).toBe(3);
    expect(deriveFloor("Flat 4A", 6)).toBe(4);
    expect(deriveFloor("Penthouse", 6)).toBe(1);
  });
  it("never exceeds the building", () => {
    expect(deriveFloor("Unit 901", 5)).toBe(5);
    expect(deriveFloor("Flat 12", 3)).toBe(3);
  });
});

describe("phone helpers", () => {
  it("accepts only a full Bangladeshi mobile number", () => {
    expect(isFullPhone("01712345678")).toBe(true);
    expect(isFullPhone("0171234567")).toBe(false);
    expect(isFullPhone("02712345678")).toBe(false);
  });
  it("normalises +88 and separators", () => {
    expect(normalizePhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizePhone("017 1234 5678")).toBe("01712345678");
  });
});
