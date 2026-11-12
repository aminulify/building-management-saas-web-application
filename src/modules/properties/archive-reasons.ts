/** Why a property left the live lists. Shared by the owner's Delete window and the Super Admin's Previous Properties page. */
export const ARCHIVE_REASONS = [
  "OWNER_REQUEST", "POLICY_VIOLATION", "NON_PAYMENT", "BUILDING_DEMOLISHED", "SOLD_PROPERTY", "RENOVATION",
  "NOT_INTERESTED", "DUPLICATE_ENTRY", "MOVED_PLATFORM", "OTHER",
] as const;
export type ArchiveReasonCode = (typeof ARCHIVE_REASONS)[number];

/** What an owner can pick when deleting a property (the rest are decided by the platform team). */
export const OWNER_REASONS = ["SOLD_PROPERTY", "NOT_INTERESTED", "BUILDING_DEMOLISHED", "RENOVATION", "DUPLICATE_ENTRY", "MOVED_PLATFORM", "OTHER"] as const;

/** Stored beside the code so the record reads well even without a note. */
export const REASON_TEXT: Record<ArchiveReasonCode, string> = {
  OWNER_REQUEST: "Owner request", POLICY_VIOLATION: "Policy violation", NON_PAYMENT: "Non-payment", BUILDING_DEMOLISHED: "Building demolished",
  SOLD_PROPERTY: "Sold property", RENOVATION: "Renovation / remodeling", NOT_INTERESTED: "Not interested anymore",
  DUPLICATE_ENTRY: "Added by mistake or duplicate", MOVED_PLATFORM: "Moved to another platform", OTHER: "Other",
};
