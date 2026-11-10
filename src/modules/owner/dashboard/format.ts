const tag = (locale: string) => (locale === "bn" ? "bn-BD" : "en-US");

export const formatNumber = (locale: string) => (n: number) => new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(Math.round(n));

/** ৳165,000 (Bangla digits in the Bangla UI). Whole taka, like the design. */
export const formatTaka = (locale: string) => (n: number) => `৳${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(Math.round(n))}`;

export const formatPercent = (locale: string) => (n: number) => `${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(Math.round(n))}%`;

export const shortMonth = (locale: string, month1to12: number) =>
  new Intl.DateTimeFormat(tag(locale), { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month1to12 - 1, 1)));

/** "5 minutes ago" / "২ দিন আগে" */
export function timeAgo(locale: string, iso: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of steps) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(Math.round(diff), "second");
}
