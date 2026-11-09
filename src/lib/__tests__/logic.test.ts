import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { computeStatus, dueDateFor, monthStart } from "@/modules/rent/billing";
import { addMonths } from "@/modules/billing/upgrade.service";
import { stageOf } from "@/modules/emergency/sos.service";
import { upgradeRequestSchema } from "@/modules/billing/upgrade-schema";
import { registerSchema } from "@/modules/auth/schema";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

const D = (n: number) => new Prisma.Decimal(n);

describe("rent billing", () => {
  it("monthStart accepts YYYY-MM and dates", () => {
    expect(monthStart("2026-03").toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(monthStart(new Date("2026-03-19T10:00:00Z")).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
  it("computes record status", () => {
    const due = dueDateFor(monthStart("2026-03"));
    const before = new Date("2026-03-05T00:00:00Z");
    const after = new Date("2026-03-20T00:00:00Z");
    expect(computeStatus(D(1000), D(0), due, before)).toBe("DUE");
    expect(computeStatus(D(1000), D(400), due, before)).toBe("PARTIAL");
    expect(computeStatus(D(1000), D(400), due, after)).toBe("OVERDUE");
    expect(computeStatus(D(1000), D(1000), due, after)).toBe("PAID");
  });
});

describe("subscriptions", () => {
  it("adds billing months", () => {
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 3).toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
  const ok = { planId: crypto.randomUUID(), cycle: "MONTHLY", senderNumber: "01712345678", trxId: "9j28xk120a" };
  it("normalises and validates bKash fields", () => {
    expect(upgradeRequestSchema.parse(ok).trxId).toBe("9J28XK120A");
    expect(upgradeRequestSchema.safeParse({ ...ok, trxId: "SHORT" }).success).toBe(false);
    expect(upgradeRequestSchema.safeParse({ ...ok, senderNumber: "01212345678" }).success).toBe(false);
  });
});

describe("emergency stages never over-claim", () => {
  const base = { status: "NEED_ACTION" as const, acknowledgedAt: null, events: [] };
  it("walks received → seen → forwarded → solved", () => {
    expect(stageOf(base).stage).toBe("RECEIVED_BY_PLATFORM");
    expect(stageOf({ ...base, status: "PROCESSING", acknowledgedAt: new Date() }).stage).toBe("SEEN_BY_GOV");
    expect(stageOf({ ...base, status: "PROCESSING", events: [{ action: "FORWARD", forwardRef: "R-1", forwardTo: "POLICE_999" }] }).stage).toBe("FORWARDED");
    expect(stageOf({ ...base, status: "SOLVED" }).stage).toBe("SOLVED");
  });
});

describe("registration validation", () => {
  const ok = { fullName: "Rahim Uddin", username: "rahim12", email: "R@Example.com", phone: "01712345678", password: "abcd1234", role: "OWNER", consent: true };
  it("accepts public roles only", () => {
    expect(registerSchema.parse(ok).email).toBe("r@example.com");
    expect(registerSchema.safeParse({ ...ok, role: "SUPER_ADMIN" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, role: "GOV_ADMIN" }).success).toBe(false);
  });
  it("rejects weak passwords, bad usernames, missing consent", () => {
    expect(registerSchema.safeParse({ ...ok, password: "abcdefgh" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, username: "Bad Name" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after max hits", () => {
    for (let i = 0; i < 3; i++) rateLimit("t1", 3, 1000);
    expect(() => rateLimit("t1", 3, 1000)).toThrow(AppError);
  });
});

describe("i18n parity", () => {
  const keys = (o: unknown, p = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  it("every en key exists in bn and vice versa", () => {
    const en = keys(JSON.parse(readFileSync("messages/en.json", "utf8"))).sort();
    const bn = keys(JSON.parse(readFileSync("messages/bn.json", "utf8"))).sort();
    expect(bn).toEqual(en);
  });
});

import { planCreateSchema, planUpdateSchema } from "@/modules/billing/schema";
import { listingCreateSchema, listingUpdateSchema } from "@/modules/marketplace/schema";
import { toCsv } from "@/lib/csv";
import { maskNid } from "@/modules/directory/service";

describe("partial updates never reset omitted fields (zod defaults regression)", () => {
  it("plan update only contains the keys that were sent", () => {
    expect(planUpdateSchema.parse({ monthlyPrice: 120 })).toEqual({ monthlyPrice: 120 });
    const created = planCreateSchema.parse({ code: "TEST_PLAN", nameBn: "ক", nameEn: "A", audience: "SELLER", monthlyPrice: 99, listingLimit: 3 });
    expect(created.listingLimit).toBe(3);
    expect(created.quarterlyDiscount).toBe(10);
    expect(created.yearlyDiscount).toBe(20);
  });
  it("listing update does not touch negotiable/amenities/declaration", () => {
    expect(listingUpdateSchema.parse({ price: 1000 })).toEqual({ price: 1000 });
    const l = listingCreateSchema.parse({ type: "RENT", category: "LAND", title: "Plot in Uttara", description: "A very nice plot near the lake road.", price: 1, area: 5, areaUnit: "KATHA" });
    expect(l.negotiable).toBe(false);
    expect(l.amenities).toEqual([]);
    expect(l.declaration).toBe(false);
  });
});

describe("csv + masking", () => {
  it("escapes quotes/commas and neutralises spreadsheet formulas", () => {
    const out = toCsv([{ a: 'x,"y"', b: "=HYPERLINK(1)" }]);
    expect(out).toBe('a,b\r\n"x,""y""",\'=HYPERLINK(1)');
  });
  it("masks NID but keeps the last 4 digits", () => {
    expect(maskNid("1234")).toBe("•••••••••1234");
    expect(maskNid(null)).toBeNull();
  });
});

import { availabilityQuery, regUploadSchema } from "@/modules/auth/schema";
import { nidSchema, usernameSchema } from "@/modules/users/schema";

describe("sign-up field rules (design: username with underscore, NID 13-17 digits)", () => {
  it("username allows lowercase letters, digits and underscore", () => {
    expect(usernameSchema.safeParse("abdur_rahman24").success).toBe(true);
    expect(usernameSchema.safeParse("Abdur Rahman").success).toBe(false);
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });
  it("NID must be 13 to 17 digits", () => {
    for (const ok of ["1234567890123", "12345678901234", "12345678901234567"]) expect(nidSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["1234567890", "123456789012", "123456789012345678", "12345678901ab"]) expect(nidSchema.safeParse(bad).success).toBe(false);
  });
  it("register accepts occupation, union and post office", () => {
    const r = registerSchema.parse({ fullName: "Abdur Rahman", username: "abdur_rahman24", email: "rahman@example.com", phone: "01712345678", password: "abcd1234", role: "TENANT", consent: true, occupation: "Software Engineer", address: { division: "Dhaka", district: "Dhaka", union: "Sector 4", postOffice: "1000", street: "House 12, Road 5" }, uploadSession: crypto.randomUUID() });
    expect(r.address?.union).toBe("Sector 4");
  });
  it("availability needs one valid field; public upload only allows NID/avatar", () => {
    expect(availabilityQuery.safeParse({}).success).toBe(false);
    expect(availabilityQuery.safeParse({ username: "abdur_rahman24" }).success).toBe(true);
    expect(regUploadSchema.safeParse({ session: crypto.randomUUID(), purpose: "AGREEMENT", mime: "image/png", size: 1 }).success).toBe(false);
  });
});

import { loginFormSchema } from "@/modules/auth/login/schema";
import { safeNext } from "@/lib/auth-client";

describe("sign-in form rules", () => {
  it("requires identifier and password; remember is a plain boolean", () => {
    const keys = (v: object) => loginFormSchema.safeParse(v).error?.issues.map((i) => i.message) ?? [];
    expect(keys({ identifier: "", password: "", remember: false })).toEqual(expect.arrayContaining(["identifierRequired", "passwordRequiredLogin"]));
    expect(keys({ identifier: "ab", password: "x", remember: false })).toContain("identifierShort");
    expect(keys({ identifier: "abdur_rahman24", password: "x", remember: true })).toEqual([]);
    expect(keys({ identifier: "name@example.com", password: "x", remember: false })).toEqual([]);
  });
  it("post-login redirect only accepts same-site relative paths", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/en/owner/dashboard?tab=1")).toBe("/en/owner/dashboard?tab=1");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "\\\\evil", "", null, undefined]) expect(safeNext(bad as string | null)).toBeNull();
  });
});
