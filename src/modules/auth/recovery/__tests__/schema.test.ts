import { describe, expect, it } from "vitest";
import { allRulesMet, forgotFormSchema, passwordRules } from "../schema";

describe("recovery schema", () => {
  it("validates the email", () => {
    expect(forgotFormSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(forgotFormSchema.safeParse({ email: "" }).success).toBe(false);
    expect(forgotFormSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("evaluates the four password rules", () => {
    expect(passwordRules("abc", "")).toEqual({ length: false, number: false, case: false, match: false });
    expect(passwordRules("Passw0rdX", "Passw0rdX")).toEqual({ length: true, number: true, case: true, match: true });
    expect(passwordRules("passw0rdx", "passw0rdx").case).toBe(false);
    expect(passwordRules("Passw0rdX", "Passw0rdY").match).toBe(false);
  });
  it("needs every rule and at most 72 chars", () => {
    expect(allRulesMet("Passw0rdX", "Passw0rdX")).toBe(true);
    expect(allRulesMet("Passw0rd", "Passw0rdX")).toBe(false);
    const long = "Aa1" + "x".repeat(70);
    expect(allRulesMet(long, long)).toBe(false);
  });
});
