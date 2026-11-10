import { describe, expect, it } from "vitest";
import { alertFormSchema } from "../alert-schema";
import { formatTaka, timeAgo } from "../format";

const ok = { message: "Fire in the kitchen", contact: "01712345678", name: "Abdur Rahman", thana: "Mirpur Model", location: "House 12, Road 5", district: "d1", hasGps: false };

describe("alertFormSchema", () => {
  it("accepts a complete form", () => expect(alertFormSchema.safeParse(ok).success).toBe(true));
  it("rejects a bad phone, short message and missing district", () => {
    expect(alertFormSchema.safeParse({ ...ok, contact: "12345" }).success).toBe(false);
    expect(alertFormSchema.safeParse({ ...ok, message: "hi" }).success).toBe(false);
    expect(alertFormSchema.safeParse({ ...ok, district: "" }).success).toBe(false);
  });
  it("needs an address unless GPS was captured", () => {
    const noAddr = alertFormSchema.safeParse({ ...ok, location: "" });
    expect(noAddr.success).toBe(false);
    expect(alertFormSchema.safeParse({ ...ok, location: "", hasGps: true }).success).toBe(true);
  });
});

describe("format helpers", () => {
  it("formats taka for both languages", () => {
    expect(formatTaka("en")(165000)).toBe("৳165,000");
    expect(formatTaka("bn")(165000)).toContain("১,৬৫,০০০");
  });
  it("describes elapsed time", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(timeAgo("en", "2026-11-10T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("en", "2026-11-08T12:00:00Z", now)).toBe("2 days ago");
  });
});
