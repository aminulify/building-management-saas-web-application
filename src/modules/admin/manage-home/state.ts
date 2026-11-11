import type { Prisma } from "@prisma/client";

/**
 * Manage Home (Super Admin): one rule set for the server (filters, counters) and the page (badge).
 *   ACTIVE   = approved: PUBLISHED with no open report, or already SOLD / RENTED
 *   PENDING  = waiting for approval
 *   REPORTED = flagged: PUBLISHED but people reported it (open report), or SUSPENDED (hidden until reviewed)
 *   REJECTED = approval refused
 * DRAFT, EXPIRED and ARCHIVED listings are not part of this page.
 */
export type ModerationState = "ACTIVE" | "PENDING" | "REPORTED" | "REJECTED";
export const MODERATION_STATES: readonly ModerationState[] = ["ACTIVE", "PENDING", "REPORTED", "REJECTED"];
export type HomeMode = "rent" | "sale";

export const LISTED_STATUSES = ["PENDING", "PUBLISHED", "REJECTED", "SUSPENDED", "SOLD", "RENTED"] as const;

export function listingState(l: { status: string; openReports: number }): ModerationState {
  switch (l.status) {
    case "PENDING": return "PENDING";
    case "REJECTED": return "REJECTED";
    case "SUSPENDED": return "REPORTED";
    case "PUBLISHED": return l.openReports > 0 ? "REPORTED" : "ACTIVE";
    default: return "ACTIVE"; // SOLD, RENTED
  }
}

const OPEN = { reports: { some: { status: "OPEN" } } } satisfies Prisma.ListingWhereInput;
const NO_OPEN = { reports: { none: { status: "OPEN" } } } satisfies Prisma.ListingWhereInput;

export const stateWhere = (s: ModerationState): Prisma.ListingWhereInput => {
  switch (s) {
    case "ACTIVE": return { OR: [{ status: { in: ["SOLD", "RENTED"] } }, { status: "PUBLISHED", ...NO_OPEN }] };
    case "PENDING": return { status: "PENDING" };
    case "REPORTED": return { OR: [{ status: "SUSPENDED" }, { status: "PUBLISHED", ...OPEN }] };
    case "REJECTED": return { status: "REJECTED" };
  }
};

/** A rental is occupied when it is marked RENTED or the unit it advertises has a tenant. */
export const OCCUPIED: Prisma.ListingWhereInput = { OR: [{ status: "RENTED" }, { unit: { availability: "OCCUPIED" } }] };

/** What a chosen state writes to the listing. */
export const STATE_FIELDS: Record<ModerationState, { status: "PUBLISHED" | "PENDING" | "SUSPENDED" | "REJECTED"; reason: string | null }> = {
  ACTIVE: { status: "PUBLISHED", reason: null },
  PENDING: { status: "PENDING", reason: null },
  REPORTED: { status: "SUSPENDED", reason: "Reported: under review by the platform team" },
  REJECTED: { status: "REJECTED", reason: "Rejected by the platform team" },
};

/** The "Nearby places" checklist of View Details, matched against the listing's amenity codes. */
export const NEARBY: Record<"SCHOOL" | "COLLEGE" | "HOSPITAL" | "PARK" | "SECURITY", readonly string[]> = {
  SCHOOL: ["SCHOOL"], COLLEGE: ["COLLEGE", "UNIVERSITY"], HOSPITAL: ["HOSPITAL"], PARK: ["PARK", "PLAYGROUND"], SECURITY: ["SECURITY", "SECURITY_GUARD", "GATED", "CCTV"],
};
export const nearbyOf = (amenities: string[]) =>
  Object.fromEntries(Object.entries(NEARBY).map(([k, codes]) => [k, codes.some((c) => amenities.includes(c))])) as Record<keyof typeof NEARBY, boolean>;
