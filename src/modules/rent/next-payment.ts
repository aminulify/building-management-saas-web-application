import { dueDateFor, monthStart } from "./billing";

export interface RecordLite { id: string; billingMonth: Date; total: number; paid: number; dueDate: Date; status: "DUE" | "PARTIAL" | "PAID" | "OVERDUE" }
export type PaymentState = "DUE" | "PARTIAL" | "OVERDUE" | "UPCOMING";

export interface NextPayment { recordId: string | null; month: string; amount: number; dueDate: Date; state: PaymentState }

const ym = (d: Date) => d.toISOString().slice(0, 7);
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What the tenant sees on "Next Payment Due": the oldest month that is not fully paid (amount = what is still owed),
 * or, when everything is paid, the month after the latest bill with the normal monthly amount (nothing to pay yet).
 */
export function nextPayment(records: RecordLite[], monthlyAmount: number, now = new Date()): NextPayment {
  const open = records.filter((r) => r.status !== "PAID" && r.total - r.paid > 0.004).sort((a, b) => a.billingMonth.getTime() - b.billingMonth.getTime())[0];
  if (open) {
    const late = now.getTime() > open.dueDate.getTime() + 86_400_000 - 1;
    return { recordId: open.id, month: ym(open.billingMonth), amount: round(open.total - open.paid), dueDate: open.dueDate, state: late ? "OVERDUE" : open.paid > 0 ? "PARTIAL" : "DUE" };
  }
  const latest = records.reduce<Date | null>((m, r) => (!m || r.billingMonth > m ? r.billingMonth : m), null) ?? monthStart(now);
  const next = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 1));
  return { recordId: null, month: ym(next), amount: round(monthlyAmount), dueDate: dueDateFor(next), state: "UPCOMING" };
}
