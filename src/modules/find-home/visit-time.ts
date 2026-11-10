/** 08:00 – 20:30 every half hour (the server accepts 08:00–21:00 Bangladesh time). */
export const SLOTS = Array.from({ length: 26 }, (_, k) => `${String(8 + Math.floor(k / 2)).padStart(2, "0")}:${k % 2 ? "30" : "00"}`);

/** The chosen date + time are Bangladesh local time (UTC+6), whatever the visitor's computer clock says. */
export const toBdIso = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`).toISOString();

export const dayStr = (offsetDays: number) => new Date(Date.now() + 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

export const whenLabel = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
