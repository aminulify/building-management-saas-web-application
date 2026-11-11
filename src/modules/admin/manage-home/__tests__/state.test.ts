import { describe, expect, it } from "vitest";
import { homeFeatureSchema, homeStateSchema, homeTableQuery } from "../service";
import { listingState, MODERATION_STATES, nearbyOf, STATE_FIELDS } from "../state";

describe("moderation state of a listing", () => {
  it("published and clean = Active; published with an open report = Reported", () => {
    expect(listingState({ status: "PUBLISHED", openReports: 0 })).toBe("ACTIVE");
    expect(listingState({ status: "PUBLISHED", openReports: 2 })).toBe("REPORTED");
  });
  it("pending, rejected and suspended map to Pending, Rejected and Reported", () => {
    expect(listingState({ status: "PENDING", openReports: 0 })).toBe("PENDING");
    expect(listingState({ status: "REJECTED", openReports: 0 })).toBe("REJECTED");
    expect(listingState({ status: "SUSPENDED", openReports: 0 })).toBe("REPORTED");
  });
  it("a sold or rented listing stays Active", () => {
    expect(listingState({ status: "SOLD", openReports: 0 })).toBe("ACTIVE");
    expect(listingState({ status: "RENTED", openReports: 0 })).toBe("ACTIVE");
  });
  it("the status a chosen state writes reads back as the same state", () => {
    for (const s of MODERATION_STATES) expect(listingState({ status: STATE_FIELDS[s].status, openReports: 0 })).toBe(s);
  });
});

describe("nearby places", () => {
  it("matches the checklist against amenity codes", () => {
    expect(nearbyOf(["HOSPITAL", "PARK", "PARKING"])).toEqual({ SCHOOL: false, COLLEGE: false, HOSPITAL: true, PARK: true, SECURITY: false });
    expect(nearbyOf(["PLAYGROUND", "UNIVERSITY", "GATED"])).toMatchObject({ PARK: true, COLLEGE: true, SECURITY: true });
    expect(nearbyOf([])).toEqual({ SCHOOL: false, COLLEGE: false, HOSPITAL: false, PARK: false, SECURITY: false });
  });
});

describe("manage home input", () => {
  it("table query: rental mode, all listings, 9 rows by default", () => {
    expect(homeTableQuery.parse({})).toEqual({ mode: "rent", status: "all", occupancy: "all", sale: "all", category: "all", featured: "all", limit: 9 });
  });
  it("only known modes, statuses, occupancy and sale filters; page size capped", () => {
    expect(homeTableQuery.safeParse({ mode: "buy" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ status: "archived" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ occupancy: "full" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ sale: "maybe" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ limit: "99" }).success).toBe(false);
    expect(homeTableQuery.parse({ mode: "sale", status: "reported", sale: "sold", limit: "10" })).toMatchObject({ mode: "sale", status: "reported", sale: "sold", limit: 10 });
  });
  it("a moderation change is one of the four states", () => {
    for (const s of MODERATION_STATES) expect(homeStateSchema.safeParse({ state: s }).success).toBe(true);
    expect(homeStateSchema.safeParse({ state: "ARCHIVED" }).success).toBe(false);
    expect(homeStateSchema.safeParse({ state: "SUSPENDED" }).success).toBe(false);
  });
});

describe("manage marketplace input", () => {
  it("search, category and featured-only are optional filters", () => {
    expect(homeTableQuery.parse({ mode: "sale", q: "  Savar  ", category: "LAND", featured: "yes" })).toMatchObject({ mode: "sale", q: "Savar", category: "LAND", featured: "yes" });
  });
  it("rejects an unknown category, a featured value that is not all / yes, and a very long search", () => {
    expect(homeTableQuery.safeParse({ category: "VILLA" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ featured: "no" }).success).toBe(false);
    expect(homeTableQuery.safeParse({ q: "x".repeat(81) }).success).toBe(false);
  });
  it("feature / unfeature takes a real boolean", () => {
    expect(homeFeatureSchema.safeParse({ featured: true }).success).toBe(true);
    expect(homeFeatureSchema.safeParse({ featured: false }).success).toBe(true);
    expect(homeFeatureSchema.safeParse({ featured: "true" }).success).toBe(false);
    expect(homeFeatureSchema.safeParse({}).success).toBe(false);
  });
});

describe("For Sale / Sold in the edit window", () => {
  it("the state call may carry sold true or false, never anything else", () => {
    expect(homeStateSchema.safeParse({ state: "ACTIVE", sold: true }).success).toBe(true);
    expect(homeStateSchema.safeParse({ state: "ACTIVE", sold: false }).success).toBe(true);
    expect(homeStateSchema.safeParse({ state: "ACTIVE" }).success).toBe(true);
    expect(homeStateSchema.safeParse({ state: "ACTIVE", sold: "yes" }).success).toBe(false);
  });
});
