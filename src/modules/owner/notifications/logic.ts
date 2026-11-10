import type { Kind, Notification, NotificationsPage, Tab } from "./types";

export const FIRST_PAGE = 6;
export const MORE_PAGE = 10;

export const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Which card this notification becomes. */
export function kindOf(n: Pick<Notification, "type" | "params">): Kind {
  switch (n.type) {
    case "rent.received": return "received";
    case "rent.overdue": return "overdue";
    case "sos.new": return "emergency";
    case "sos.update": return n.params.status === "SOLVED" ? "solve" : "quick";
    case "tenancy.accepted": return "tenancy";
    default: return n.type.startsWith("maintenance.") ? "maintenance" : "generic";
  }
}

/** Story modals know how to load their details from the ids stored in the notification. */
export const storyRef = (n: Pick<Notification, "type" | "params">): { kind: "payment" | "issue" | "alert"; id: string } | null => {
  const p = n.params;
  if (n.type === "rent.received" && str(p.paymentId)) return { kind: "payment", id: str(p.paymentId) };
  if (n.type.startsWith("maintenance.") && str(p.requestId)) return { kind: "issue", id: str(p.requestId) };
  if ((n.type === "sos.new" || n.type === "sos.update") && str(p.alertId)) return { kind: "alert", id: str(p.alertId) };
  return null;
};

export type RelUnit = "justNow" | "min" | "hour" | "yesterday" | "day" | "week" | "lastMonth" | "month" | "year";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "12 mins ago", "yesterday", "2 days ago", "last month": picks the wording; the page translates it and refreshes it every minute. */
export function relativeTime(iso: string, now = Date.now()): { unit: RelUnit; n: number } {
  const t = new Date(iso);
  const ms = Math.max(0, now - t.getTime());
  const today = new Date(now);
  const days = Math.round((startOfDay(today) - startOfDay(t)) / 86_400_000);
  if (days <= 0) {
    if (ms < 60_000) return { unit: "justNow", n: 0 };
    if (ms < 3_600_000) return { unit: "min", n: Math.floor(ms / 60_000) };
    return { unit: "hour", n: Math.floor(ms / 3_600_000) };
  }
  if (days === 1) return { unit: "yesterday", n: 1 };
  if (days < 7) return { unit: "day", n: days };
  const months = (today.getFullYear() - t.getFullYear()) * 12 + today.getMonth() - t.getMonth();
  if (months <= 0) return { unit: "week", n: Math.floor(days / 7) };
  if (months === 1) return { unit: "lastMonth", n: 1 };
  if (months < 12) return { unit: "month", n: months };
  return { unit: "year", n: Math.floor(months / 12) };
}

/**
 * Merge a fresh first page into the list. Only notifications NEWER than the newest one on screen are added (on top);
 * older ones that merely moved into the first page come later with "Load more". Read marks made elsewhere show up too.
 */
export function mergeFresh(current: Notification[], fresh: Notification[]): { items: Notification[]; added: number } {
  const newest = current.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), "");
  const known = new Set(current.map((n) => n.id));
  const added = fresh.filter((n) => !known.has(n.id) && n.createdAt > newest);
  const readAt = new Map(fresh.map((n) => [n.id, n.readAt]));
  const updated = current.map((n) => (readAt.has(n.id) && readAt.get(n.id) !== n.readAt ? { ...n, readAt: readAt.get(n.id) ?? null } : n));
  return { items: [...added, ...updated], added: added.length };
}

/** Counts shown on the header badge and the tabs after one notification is read. */
export function afterRead(p: Pick<NotificationsPage, "unread" | "unreadByCategory">, n: Pick<Notification, "category" | "readAt">) {
  if (n.readAt) return p;
  return {
    unread: Math.max(0, p.unread - 1),
    unreadByCategory: {
      payment: Math.max(0, p.unreadByCategory.payment - (n.category === "payment" ? 1 : 0)),
      maintenance: Math.max(0, p.unreadByCategory.maintenance - (n.category === "maintenance" ? 1 : 0)),
    },
  };
}

export const tabBadge = (tab: Tab, p: Pick<NotificationsPage, "unread" | "unreadByCategory">) => (tab === "all" ? p.unread : p.unreadByCategory[tab]);

/** "2026-11" → "November 2026" / "নভেম্বর ২০২৬". */
export function monthLabel(locale: string, ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))) : ym;
}
