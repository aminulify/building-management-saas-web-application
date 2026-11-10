/** "+880 1712-345678" for a stored 01712345678. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  return /^01\d{9}$/.test(phone) ? `+880 ${phone.slice(1, 5)}-${phone.slice(5)}` : phone;
}

/** "Nov 02, 2025" / "০২ নভে, ২০২৫" */
export function formatDate(locale: string, iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** Whole days from today (UTC) to a date: positive = in the future. */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(iso).getTime() - today) / 86_400_000);
}
