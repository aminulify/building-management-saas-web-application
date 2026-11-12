/** Why an owner left the active list (Previous Owners page filter, Edit window and the Active Owners archive). */
export const OWNER_EXIT_REASONS = [
  "SUBSCRIPTION_CANCELLED", "POLICY_VIOLATION_FRAUD", "BUSINESS_CLOSED", "SOLD_ALL_PROPERTIES", "ACCOUNT_DELETED_BY_USER",
  "NON_PAYMENT", "DORMANT", "OWNER_REQUEST", "OTHER",
] as const;
export type OwnerExitReason = (typeof OWNER_EXIT_REASONS)[number];

/** Stored beside the code so the record reads well without a note. */
export const OWNER_EXIT_TEXT: Record<OwnerExitReason, string> = {
  SUBSCRIPTION_CANCELLED: "Subscription cancelled", POLICY_VIOLATION_FRAUD: "Policy violation (fraud)", BUSINESS_CLOSED: "Business closed",
  SOLD_ALL_PROPERTIES: "Sold all properties", ACCOUNT_DELETED_BY_USER: "Account deleted by user", NON_PAYMENT: "Non-payment",
  DORMANT: "Dormant account", OWNER_REQUEST: "Owner request", OTHER: "Other",
};
