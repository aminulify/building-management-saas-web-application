import { z } from "zod";

/** Bangladesh is UTC+6 all year (no daylight saving): a "day" for the Super Admin runs from 00:00 to 23:59:59.999 +06:00. */
const DHAKA = "+06:00";
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").refine((s) => !Number.isNaN(new Date(`${s}T00:00:00${DHAKA}`).getTime()), "invalid_date");

export const startOfDay = (day: string) => new Date(`${day}T00:00:00.000${DHAKA}`);
export const endOfDay = (day: string) => new Date(`${day}T23:59:59.999${DHAKA}`);

/** Today's date in Dhaka as "YYYY-MM-DD". */
export const dhakaToday = (now = new Date()) => new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
/** First day of the current month in Dhaka. */
export const dhakaMonthStart = (now = new Date()) => `${dhakaToday(now).slice(0, 8)}01`;

/** `?from=2026-10-01&to=2026-12-30`: both optional, a month so far when empty; the end day counts in full. */
export const adminRangeQuery = z
  .object({ from: dayString.optional(), to: dayString.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "invalid_range", path: ["to"] })
  .refine((v) => !v.from || !v.to || (endOfDay(v.to).getTime() - startOfDay(v.from).getTime()) / 86_400_000 <= 3660, { message: "range_too_long", path: ["to"] });

export interface ResolvedRange { from: string; to: string; start: Date; end: Date }

export function resolveRange(q: z.infer<typeof adminRangeQuery>, now = new Date()): ResolvedRange {
  const to = q.to ?? (q.from && q.from > dhakaToday(now) ? q.from : dhakaToday(now));
  const from = q.from ?? (dhakaMonthStart(now) <= to ? dhakaMonthStart(now) : to);
  return { from, to, start: startOfDay(from), end: endOfDay(to) };
}
