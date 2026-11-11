/** Pure calculations for the tenant's Rental & Payment History page (kept apart so they are easy to test). */

/** After this day of the month an unpaid rent counts as late (the red card). */
export const GRACE_DAY = 5;
const DHAKA_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;

export type LedgerState = "PAID" | "PENDING" | "UNPAID";
export type UnpaidState = "CLEAR" | "DUE_SOON" | "OVERDUE";

/** The month ("YYYY-MM") and day of month in Bangladesh time. */
export function dhakaNow(now = new Date()): { month: string; day: number } {
  const d = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return { month: d.toISOString().slice(0, 7), day: d.getUTCDate() };
}

/** Is rent for `month` ("YYYY-MM") late today? Earlier months always are; this month only after the 5th. */
export function isLate(month: string, now = new Date()): boolean {
  const t = dhakaNow(now);
  return month < t.month || (month === t.month && t.day > GRACE_DAY);
}

/** Paid, waiting for the landlord to verify a payment request, or unpaid (a rejected request leaves it unpaid). */
export function ledgerState(r: { total: number; paid: number }, hasPendingRequest: boolean): LedgerState {
  if (r.total - r.paid <= 0.004) return "PAID";
  return hasPendingRequest ? "PENDING" : "UNPAID";
}

/**
 * Years rented across every stay: overlapping stays are counted once, a stay with no end date runs to today, and the
 * result is rounded to one decimal (2.8 years).
 */
export function tenureYears(stays: { start: Date; end: Date | null }[], now = new Date()): number {
  const spans = stays
    .map((s) => ({ a: s.start.getTime(), b: Math.min(s.end ? s.end.getTime() + DAY_MS : now.getTime(), now.getTime()) }))
    .filter((s) => s.b > s.a)
    .sort((x, y) => x.a - y.a);
  let total = 0;
  let cur: { a: number; b: number } | null = null;
  for (const s of spans) {
    if (cur && s.a <= cur.b) cur.b = Math.max(cur.b, s.b);
    else { if (cur) total += cur.b - cur.a; cur = { ...s }; }
  }
  if (cur) total += cur.b - cur.a;
  return Math.round((total / DAY_MS / 365.25) * 10) / 10;
}

/**
 * The Unpaid Balance card: late money (red), money not late yet (amber), or all clear (green).
 * `amount` is what the card shows: the late money when there is any, otherwise what is still owed.
 */
export function unpaidSummary(open: { month: string; owed: number }[], now = new Date()): { amount: number; late: number; notLate: number; state: UnpaidState } {
  const round = (n: number) => Math.round(n * 100) / 100;
  let late = 0;
  let notLate = 0;
  for (const r of open) if (r.owed > 0.004) (isLate(r.month, now) ? (late += r.owed) : (notLate += r.owed));
  const state: UnpaidState = late > 0 ? "OVERDUE" : notLate > 0 ? "DUE_SOON" : "CLEAR";
  return { amount: round(late > 0 ? late + notLate : notLate), late: round(late), notLate: round(notLate), state };
}
