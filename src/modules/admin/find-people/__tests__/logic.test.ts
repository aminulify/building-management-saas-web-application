import { describe, expect, it } from "vitest";
import { classify, hasKind, normalizePhone } from "../logic";
import { findQuery } from "../service";

describe("Find People search text", () => {
  it("a phone is found however it is typed", () => {
    for (const v of ["01712345678", "+8801712345678", "8801712345678", "017 1234 5678", "017-1234-5678"]) expect(normalizePhone(v)).toBe("01712345678");
    for (const v of ["0212345678", "12345", "02-1234567", "01212345678"]) expect(normalizePhone(v)).toBeNull();
  });
  it("13 to 17 digits can be an NID, and a phone with the country code is both an NID candidate and a phone", () => {
    expect(classify("1962089904192")).toEqual({ nid: "1962089904192" });
    expect(classify("19620899041921234")).toEqual({ nid: "19620899041921234" });
    expect(classify("8801712345678")).toEqual({ phone: "01712345678", nid: "8801712345678" });
    expect(classify("01712345678")).toEqual({ phone: "01712345678" });
    expect(classify("123456789")).toEqual({});
  });
  it("an e-mail is lower-cased and never mixed with other kinds", () => {
    expect(classify("Rahim.K@Gmail.com")).toEqual({ email: "rahim.k@gmail.com" });
  });
  it("account IDs and usernames", () => {
    expect(classify("ow10032")).toEqual({ code: "OW10032", username: "ow10032" });
    expect(classify("TF8812")).toEqual({ code: "TF8812", username: "tf8812" });
    expect(classify("tn10032").code).toBe("TN10032");
    expect(classify("rahim_k")).toEqual({ username: "rahim_k" });
  });
  it("an account uuid is its own kind", () => {
    const id = "01a1cfc3-e6f7-7340-af25-d38737c138c7";
    expect(classify(id.toUpperCase())).toEqual({ id });
  });
  it("odd text finds nothing", () => {
    for (const v of ["", "   ", "%%%", "a b c", "%owner%", "x'; drop table"]) expect(hasKind(classify(v))).toBe(false);
  });
  it("the query needs at least 3 characters", () => {
    expect(findQuery.safeParse({ q: "ab" }).success).toBe(false);
    expect(findQuery.safeParse({ q: "abc" }).success).toBe(true);
    expect(findQuery.safeParse({ q: "x".repeat(121) }).success).toBe(false);
    expect(findQuery.safeParse({}).success).toBe(false);
  });
});
