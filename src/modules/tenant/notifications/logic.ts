import type { FeedItem, Live, Tab, Tone } from "./types";

export const PAGE = 10;
export const TABS: Tab[] = ["all", "payment", "services", "issues"];

export const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** What a notification becomes on screen. `wide` cards (emergency follow-up) span the full row with a gradient. */
export interface Look { tone: Tone; tag: string; wide: boolean; actions: ("pay" | "track" | "accept" | "unsolved" | "read")[]; badge: "PAID" | "PENDING_REQUEST" | "PENDING" | "PROCESSING" | "COMPLETED" | "CLOSED" | null; dim: boolean }

/**
 * The card for one notification, decided from its type and the LIVE state of the thing it is about:
 * a bill that is already paid shows a PAID badge instead of a pay button, an emergency that is solved offers
 * ACCEPT / UNSOLVED, and so on.
 */
export function lookOf(n: Pick<FeedItem, "type" | "live" | "readAt">): Look {
  const unread = !n.readAt;
  const live: Live | null = n.live;
  const read = unread ? (["read"] as const) : [];

  if (n.type === "sos.sent" && live?.kind === "alert") {
    if (live.status === "SOLVED" && !live.accepted) return { tone: "yellow", tag: "accept", wide: true, actions: ["accept", "unsolved"], badge: null, dim: false };
    if (live.status === "SOLVED") return { tone: "pink", tag: "quick", wide: true, actions: [], badge: "COMPLETED", dim: true };
    if (live.status === "FALSE_ALARM") return { tone: "pink", tag: "quick", wide: true, actions: [], badge: "CLOSED", dim: true };
    return { tone: "pink", tag: "quick", wide: true, actions: [], badge: live.status === "PROCESSING" ? "PROCESSING" : "PENDING", dim: false };
  }
  if (n.type === "rent.late") {
    const state = live?.kind === "rent" ? live.state : "UNPAID";
    return { tone: state === "PAID" ? "green" : "red", tag: "unpaid", wide: false, actions: state === "UNPAID" ? ["pay"] : [], badge: state === "PAID" ? "PAID" : state === "PENDING" ? "PENDING_REQUEST" : null, dim: state === "PAID" };
  }
  if (n.type === "rent.invoice" || n.type === "rent.reminder") {
    const state = live?.kind === "rent" ? live.state : "UNPAID";
    return { tone: "green", tag: "payment", wide: false, actions: state === "UNPAID" ? ["pay", ...read] : [...read], badge: state === "PAID" ? "PAID" : state === "PENDING" ? "PENDING_REQUEST" : null, dim: state === "PAID" };
  }
  if (n.type.startsWith("rent.") || n.type.startsWith("payment.")) return { tone: "green", tag: "payment", wide: false, actions: [...read], badge: null, dim: false };
  if (n.type.startsWith("maintenance.")) return { tone: "yellow", tag: "maintenance", wide: false, actions: n.type === "maintenance.deleted" || n.type === "maintenance.removed" ? [...read] : ["track", ...read], badge: live?.kind === "request" && live.status === "COMPLETED" ? "COMPLETED" : null, dim: false };
  if (n.type.startsWith("complaint.") || n.type.startsWith("sos.")) return { tone: "orange", tag: "issue", wide: false, actions: [...read], badge: null, dim: false };
  if (n.type.startsWith("tenancy.")) return { tone: "purple", tag: "residency", wide: false, actions: [...read], badge: null, dim: false };
  return { tone: "slate", tag: "update", wide: false, actions: [...read], badge: null, dim: false };
}

/** "2026-02" → "February 2026" / "ফেব্রুয়ারি ২০২৬"; a list like "2026-01, 2026-02" is turned part by part. */
export function monthLabels(locale: string, v: string): string {
  return v.split(",").map((p) => p.trim()).map((ym) => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    return m ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))) : ym;
  }).join(", ");
}

/** "Feb 10, 2026" */
export const dayLabel = (locale: string, iso: string): string => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

/** Whole days from today (Bangladesh date) to a due date: negative = past. */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(`${new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((new Date(iso).getTime() - today) / 86_400_000);
}

/**
 * Put a fresh first page over the list on screen: newer notifications go on top, and every notification that is on both
 * takes the fresh state (read mark and the live status of its bill / request / alert).
 */
export function mergeFeed(current: FeedItem[], fresh: FeedItem[]): FeedItem[] {
  const newest = current.reduce((m, n) => (n.id > m ? n.id : m), "");
  const byId = new Map(fresh.map((n) => [n.id, n]));
  const known = new Set(current.map((n) => n.id));
  return [...fresh.filter((n) => !known.has(n.id) && n.id > newest), ...current.map((n) => byId.get(n.id) ?? n)];
}

/** One notification became read (here or elsewhere). */
export const markRead = (items: FeedItem[], id: string, at = new Date().toISOString()): FeedItem[] => items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: at } : n));

/** The card's live state after the tenant pressed ACCEPT / UNSOLVED / sent a pay request. */
export function patchLive(items: FeedItem[], match: (n: FeedItem) => boolean, live: (l: Live) => Live): FeedItem[] {
  return items.map((n) => (n.live && match(n) ? { ...n, live: live(n.live) } : n));
}
