/** Month helpers for the Month/Year dropdown. Months are "YYYY-MM" strings (UTC), like the API. */
export const FIRST_YEAR = 2024;

export const currentMonth = (now = new Date()) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

/** Every month from January 2024 to December 2026 (or the current year if later), newest first, grouped by year. */
export function monthOptions(now = new Date()): { year: number; months: string[] }[] {
  const last = Math.max(2026, now.getUTCFullYear());
  const out: { year: number; months: string[] }[] = [];
  for (let y = last; y >= FIRST_YEAR; y--) out.push({ year: y, months: Array.from({ length: 12 }, (_, i) => `${y}-${String(12 - i).padStart(2, "0")}`) });
  return out;
}

export const isValidMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && Number(m.slice(0, 4)) >= FIRST_YEAR;

export function monthLabel(locale: string, month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

/** Month name only ("November") for "November Rent Due". */
export function monthName(locale: string, month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}
