const tag = (locale: string) => (locale === "bn" ? "bn-BD" : "en-IN");

/** ৳ 45,000 (lakh grouping, Bangla digits in the Bangla UI) */
export const taka = (locale: string, v: string | number) => `৳ ${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 0 }).format(Math.round(Number(v)))}`;
export const plain = (locale: string, v: string | number) => new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 2 }).format(Number(v));

/** "2 hours ago" / "২ ঘণ্টা আগে"; under a minute it is `justNow` (the caller translates it) */
export function ago(locale: string, iso: string, justNow: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  if (Math.abs(diff) < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of steps) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return justNow;
}

export const day = (locale: string, iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

/** "980 sqft" / "5 katha": the stored unit is shown as written, except square feet which is translated */
export const areaText = (locale: string, area: string, unit: string | null, sqft: string) => `${plain(locale, area)} ${!unit || unit.toLowerCase() === "sqft" ? sqft : unit}`;
