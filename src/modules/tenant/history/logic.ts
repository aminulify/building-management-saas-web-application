import type { LedgerRow, Stay, UnpaidState } from "./types";

/** rows shown before "View All Receipts" (the server sends one more only to know there is more) */
export const RECENT = 4;

const tag = (locale: string) => (locale === "bn" ? "bn-BD" : "en-US");

/** "Jan 2023" from "2023-01" or an ISO date (UTC, so a date never slips a day). */
export function monthShort(locale: string, v: string): string {
  const d = new Date(v.length === 7 ? `${v}-01T00:00:00Z` : v);
  return new Intl.DateTimeFormat(tag(locale), { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}
/** "Jun 01, 2021" */
export const dayLong = (locale: string, iso: string): string => new Intl.DateTimeFormat(tag(locale), { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

/** "Jan 2023" for the active stay, the exact day for a finished one (like the design). */
export const checkIn = (locale: string, s: Pick<Stay, "status" | "startDate">) => (s.status === "ACTIVE" ? monthShort(locale, s.startDate) : dayLong(locale, s.startDate));
export const checkOut = (locale: string, s: Pick<Stay, "endDate">): string | null => (s.endDate ? dayLong(locale, s.endDate) : null);

/** "02" houses: two digits, in Bangla digits for the Bangla page. */
export const padded = (locale: string, n: number) => new Intl.NumberFormat(tag(locale), { minimumIntegerDigits: 2, useGrouping: false }).format(n);
export const oneDecimal = (locale: string) => (n: number) => new Intl.NumberFormat(tag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
/** ৳ 50,000 (whole taka) or ৳ 0.00 when nothing is owed. */
export const takaSpaced = (locale: string, n: number) =>
  `৳ ${new Intl.NumberFormat(tag(locale), n === 0 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }).format(n)}`;
export const takaPlain = (locale: string, n: number) => `৳${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 2 }).format(n)}`;

/** The colours of the Unpaid Balance card: red when late, green when clear, amber while the 5th has not passed. */
export const UNPAID_STYLE: Record<UnpaidState, { card: string; icon: string; text: string }> = {
  OVERDUE: { card: "border-red-300 bg-gradient-to-br from-[#FEE2E2] to-red-50", icon: "bg-red-100 text-red-500", text: "text-red-600" },
  DUE_SOON: { card: "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50", icon: "bg-amber-100 text-amber-600", text: "text-amber-600" },
  CLEAR: { card: "border-green-300 bg-gradient-to-br from-[#DCFCE7] to-green-50", icon: "bg-green-100 text-green-600", text: "text-green-600" },
};

export const STATE_STYLE: Record<LedgerRow["state"], string> = {
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  UNPAID: "bg-red-100 text-red-600",
};

/** Put a fresh row from the server over the same row on screen (rows loaded by "View All" keep their place). */
export function mergeRows(shown: LedgerRow[], fresh: LedgerRow[]): LedgerRow[] {
  return shown.map((r) => fresh.find((f) => f.recordId === r.recordId) ?? r);
}

/** The shape PayModal expects for the month being paid. */
export function payTarget(row: LedgerRow, payTo: string | null) {
  return { recordId: row.recordId, month: row.month, amount: row.owed, dueDate: "", state: "DUE" as const, lastPaidAt: null, lastPaidAmount: null, pending: null, payTo };
}
