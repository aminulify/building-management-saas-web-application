/**
 * What the Super Admin's Properties page calls a property's state. One rule for the server (filters, counters) and the page (badge):
 *   ACTIVE    = approved (VERIFIED) and running
 *   PENDING   = waiting for approval (UNVERIFIED or PENDING verification)
 *   REJECTED  = approval was refused
 *   SUSPENDED = switched off (suspended / inactive)
 */
export type AdminPropertyState = "ACTIVE" | "PENDING" | "REJECTED" | "SUSPENDED";
export type AdminStatusChoice = "ACTIVE" | "PENDING";

export function propertyState(p: { status: string; verificationStatus: string }): AdminPropertyState {
  if (p.status !== "ACTIVE") return "SUSPENDED";
  if (p.verificationStatus === "VERIFIED") return "ACTIVE";
  if (p.verificationStatus === "REJECTED") return "REJECTED";
  return "PENDING";
}

/** The database fields a chosen state sets. */
export const STATE_FIELDS: Record<AdminStatusChoice, { status: "ACTIVE"; verificationStatus: "VERIFIED" | "PENDING" }> = {
  ACTIVE: { status: "ACTIVE", verificationStatus: "VERIFIED" },
  PENDING: { status: "ACTIVE", verificationStatus: "PENDING" },
};

/** Occupied ÷ total units, one decimal at most; 0 when there are no units. */
export const occupancyRate = (occupied: number, total: number) => (total > 0 ? Math.min(100, Math.round((occupied * 1000) / total) / 10) : 0);
