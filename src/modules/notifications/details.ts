/**
 * What the "Details" window of a notification lists besides the message: the facts the server stored with it, in a fixed order,
 * each with a label. Technical ids and empty values are never shown.
 */
export const DETAIL_ORDER = [
  "title", "subject", "name", "tenantName", "tenant", "reporter", "user", "from", "property", "unit", "alertType", "type", "plan", "days", "month",
  "amount", "total", "paid", "due", "balance", "fee", "receipt", "status", "action", "reason", "notes",
] as const;
export type DetailKey = (typeof DETAIL_ORDER)[number];

export const MONEY_KEYS: readonly string[] = ["amount", "total", "paid", "due", "balance", "fee"];

const present = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : typeof v === "number" && Number.isFinite(v));

export interface DetailRow { key: DetailKey; value: string | number }

/** Known keys only, in the fixed order, without blanks. */
export function detailRows(params: Record<string, unknown> | null | undefined): DetailRow[] {
  const p = params ?? {};
  return DETAIL_ORDER.filter((k) => present(p[k])).map((k) => ({ key: k, value: p[k] as string | number }));
}

/** "rent.invoice" → "rent": the group a notification belongs to (shown as a label); unknown types are "other". */
export const GROUPS = ["rent", "payment", "maintenance", "sos", "tenancy", "listing", "boost", "property", "upgrade", "complaint", "account", "message", "billing"] as const;
export type Group = (typeof GROUPS)[number] | "other";
export function groupOf(type: string): Group {
  const head = type.split(/[._]/)[0] ?? "";
  return (GROUPS as readonly string[]).includes(head) ? (head as Group) : "other";
}

/** "SOME_STATUS" / "in_progress" → "Some status": a readable fallback for a stored status or action word. */
export const humanize = (v: string) => v.replace(/[_-]+/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** The first 8 characters of the id, shown as the reference number. */
export const shortRef = (id: string) => id.replace(/-/g, "").slice(-8).toUpperCase();
