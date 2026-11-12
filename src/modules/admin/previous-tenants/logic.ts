/** Pure rent-state rules of the Super Admin Previous Tenants page (no database, easy to test). */
export type RentState = "CLEARED" | "DUE_1" | "DUE_2" | "DUE_3_PLUS";

/** Months of unpaid rent → the state shown in the table: 0 Cleared, 1, 2, 3 or more. */
export const rentStateOf = (months: number): RentState => (months <= 0 ? "CLEARED" : months === 1 ? "DUE_1" : months === 2 ? "DUE_2" : "DUE_3_PLUS");

/** How many months a state stands for (3+ counts as 3). */
export const monthsOf = (s: RentState) => (s === "CLEARED" ? 0 : s === "DUE_1" ? 1 : s === "DUE_2" ? 2 : 3);

/**
 * The unpaid balance in BDT. Worked out from the rent ledger; when the Super Admin ruled a state the ledger does not show,
 * at least that many months of rent count as owed. Cleared is always 0.
 */
export function unpaidFor(state: RentState, ledgerBalance: number, monthlyRent: number, ruled: boolean) {
  if (state === "CLEARED") return 0;
  const floor = ruled ? monthsOf(state) * monthlyRent : 0;
  return Math.round(Math.max(ledgerBalance, floor) * 100) / 100;
}

/** "Kamal Hossain" → "Kamal" for "Are you sure to delete Kamal?" */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;
