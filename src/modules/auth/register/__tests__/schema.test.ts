import { describe, expect, it } from "vitest";
import {
  addressSchema, checkImage, normalizePhone, passwordScore, personalSchema, registerFormSchema, securitySchema, stepOfField,
} from "../schema";

const person = { role: "TENANT", fullName: "Abdur Rahman", username: "abdur_rahman24", email: "Rahman@Example.com", phone: "+8801712345678", occupation: "", dateOfBirth: "1994-05-17", nid: "1234567890123" };

describe("sign-up wizard validation", () => {
  it("normalises Bangladeshi phone numbers", () => {
    expect(normalizePhone("+88 017-1234 5678")).toBe("01712345678");
    expect(normalizePhone("8801712345678")).toBe("01712345678");
    expect(normalizePhone("01712345678")).toBe("01712345678");
  });

  it("step 1: accepts the design's example data", () => {
    expect(personalSchema.safeParse(person).success).toBe(true);
  });

  it("step 1: rejects bad values with translation keys", () => {
    const keys = (patch: object) => personalSchema.safeParse({ ...person, ...patch }).error?.issues.map((i) => i.message);
    expect(keys({ role: undefined })).toContain("roleRequired");
    expect(keys({ username: "Abdur Rahman" })).toContain("usernameFormat");
    expect(keys({ email: "nope" })).toContain("emailInvalid");
    expect(keys({ phone: "01212345678" })).toContain("phoneInvalid");
    expect(keys({ nid: "12345" })).toContain("nidFormat");
    expect(keys({ nid: "123456789012345678" })).toContain("nidFormat");
    expect(keys({ dateOfBirth: "2999-01-01" })).toContain("dobInvalid");
    expect(keys({ dateOfBirth: "" })).toContain("dobRequired");
  });

  it("step 2: division, district, upazila and street are required", () => {
    const keys = addressSchema.safeParse({ division: "", district: "", upazila: "", union: "", street: "", postOffice: "" }).error?.issues.map((i) => i.message);
    expect(keys).toEqual(expect.arrayContaining(["divisionRequired", "districtRequired", "upazilaRequired", "streetRequired"]));
    expect(addressSchema.safeParse({ division: "Dhaka", district: "Dhaka", upazila: "Uttara", union: "", street: "House 12, Road 5", postOffice: "" }).success).toBe(true);
  });

  it("step 3: password rules and matching", () => {
    const keys = (password: string, confirmPassword: string) => securitySchema.safeParse({ password, confirmPassword }).error?.issues.map((i) => i.message) ?? [];
    expect(keys("short1", "short1")).toContain("passwordMin");
    expect(keys("abcdefghij", "abcdefghij")).toContain("passwordDigit");
    expect(keys("1234567890", "1234567890")).toContain("passwordLetter");
    expect(keys("Passw0rd!2026", "Different1!")).toContain("passwordMismatch");
    expect(keys("Passw0rd!2026", "Passw0rd!2026")).toEqual([]);
  });

  it("full form needs consent", () => {
    const base = { ...person, division: "Dhaka", district: "Dhaka", upazila: "Uttara", union: "", street: "House 12", postOffice: "", password: "Passw0rd!2026", confirmPassword: "Passw0rd!2026" };
    expect(registerFormSchema.safeParse({ ...base, consent: false }).error?.issues.map((i) => i.message)).toContain("consentRequired");
    expect(registerFormSchema.safeParse({ ...base, consent: true }).success).toBe(true);
  });

  it("maps server field names to the right wizard step", () => {
    expect(stepOfField("email")).toBe(1);
    expect(stepOfField("address.district")).toBe(2);
    expect(stepOfField("password")).toBe(3);
    expect(stepOfField("consent")).toBe(4);
  });

  it("documents: PNG/JPG/WEBP up to 5 MB", () => {
    const f = (type: string, size: number) => ({ type, size }) as File;
    expect(checkImage(f("image/png", 1000))).toBeNull();
    expect(checkImage(f("application/pdf", 1000))).toBe("fileType");
    expect(checkImage(f("image/jpeg", 6 * 1024 * 1024))).toBe("fileSize");
    expect(checkImage(f("image/jpeg", 0))).toBe("fileEmpty");
  });

  it("password strength meter", () => {
    expect(passwordScore("abc")).toBe(0);
    expect(passwordScore("abcdefg1")).toBe(2);
    expect(passwordScore("Passw0rd!2026")).toBe(4);
  });
});
