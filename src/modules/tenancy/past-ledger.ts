/** Pure rent-ledger rules for the Previous Tenants history (no database here, so they are easy to test). */
export type LedgerStatus = "PAID_ON_TIME" | "PAID_LATE" | "DEFAULTED";

export interface LedgerInput { total: number; paid: number; dueDate: Date; payments: { amount: number; paidAt: Date }[] }

const DAY = 86_400_000;

/**
 * One month of a finished tenancy:
 *  - fully paid, the last payment made by the end of the due day → PAID_ON_TIME
 *  - fully paid after the due day → PAID_LATE
 *  - not paid in full (nothing, or only part) when the tenant left → DEFAULTED
 */
export function ledgerStatus(r: LedgerInput): LedgerStatus {
  if (r.total <= 0) return "PAID_ON_TIME";
  if (r.paid + 0.004 < r.total) return "DEFAULTED";
  const last = r.payments.reduce((m, p) => Math.max(m, p.paidAt.getTime()), 0);
  return last <= r.dueDate.getTime() + DAY - 1 ? "PAID_ON_TIME" : "PAID_LATE";
}

export interface LedgerSummary { collected: number; dues: number; months: number; onTime: number; late: number; defaulted: number; onTimeRate: number | null }

/** Totals for the tenant statement: money collected, what was still owed at checkout, share of months paid on time. */
export function ledgerSummary(rows: { total: number; paid: number; status: LedgerStatus }[]): LedgerSummary {
  const onTime = rows.filter((r) => r.status === "PAID_ON_TIME").length;
  const late = rows.filter((r) => r.status === "PAID_LATE").length;
  const defaulted = rows.filter((r) => r.status === "DEFAULTED").length;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    collected: round(rows.reduce((s, r) => s + r.paid, 0)),
    dues: round(rows.reduce((s, r) => s + Math.max(0, r.total - r.paid), 0)),
    months: rows.length, onTime, late, defaulted,
    onTimeRate: rows.length ? Math.round((onTime / rows.length) * 100) : null,
  };
}

/** "•••• •••• 1234" from the stored last four digits: the full NID number is never sent to the browser. */
export const maskNid = (last4: string | null | undefined) => (last4 ? `•••• •••• ${last4}` : null);
