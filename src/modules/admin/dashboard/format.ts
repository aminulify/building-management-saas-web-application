const tag = (locale: string) => (locale === "bn" ? "bn-BD" : "en-IN");

/** Lakh/crore grouping like the design: ৳ 12,50,000 (Bangla digits in the Bangla UI). Whole taka. */
export const formatTaka = (locale: string) => (n: number) => `৳ ${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(Math.round(n))}`;
export const formatCount = (locale: string) => (n: number) => new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0, useGrouping: false }).format(Math.round(n));

/** "1 Oct 2026" from "2026-10-01" (a calendar day, no time zone shifting). */
export const formatDay = (locale: string, day: string) =>
  new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
