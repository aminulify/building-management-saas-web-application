"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { FIRST_PAGE, MORE_PAGE, afterRead, mergeFresh } from "./logic";
import type { Notification, NotificationsPage, Tab } from "./types";

const POLL_MS = 30_000;
const query = (tab: Tab, limit: number, cursor?: string | null) => {
  const p = new URLSearchParams({ limit: String(limit) });
  if (tab !== "all") p.set("category", tab);
  if (cursor) p.set("cursor", cursor);
  return p.toString();
};

/**
 * The feed: six cards first, ten more per click, new ones arrive by themselves (checked every 30 s and when the tab
 * comes back to the front), and reading a card changes the counters at once.
 * `onUnread` tells the sidebar badge the new total.
 */
export function useNotifications(tab: Tab, onUnread: (n: number) => void) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState<Pick<NotificationsPage, "unread" | "unreadByCategory">>({ unread: 0, unreadByCategory: { payment: 0, maintenance: 0 } });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const prevTab = useRef(tab);
  const sync = useRef(onUnread);
  sync.current = onUnread;

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace(`/login?next=${encodeURIComponent("/owner/notifications")}` as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    if (prevTab.current !== tab) { prevTab.current = tab; setItems([]); setNext(null); setState("loading"); } else setState((s) => (s === "ready" ? s : "loading"));
    setFetching(true); setMoreError(false); setFresh(0);
    authApi<NotificationsPage>(`/notifications?${query(tab, FIRST_PAGE)}`)
      .then((r) => { if (id !== seq.current) return; setItems(r.items); setNext(r.nextCursor); setCounts({ unread: r.unread, unreadByCategory: r.unreadByCategory }); sync.current(r.unread); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [tab, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || fetching) return;
    const id = seq.current;
    setFetching(true); setMoreError(false);
    authApi<NotificationsPage>(`/notifications?${query(tab, MORE_PAGE, next)}`)
      .then((r) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]); setNext(r.nextCursor); })
      .catch((e) => { if (!fail(e)) setMoreError(true); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [next, fetching, tab, fail]);

  /** Ask for the newest page; anything not on screen yet is added at the top. */
  const poll = useCallback(() => {
    if (state !== "ready" || document.hidden) return;
    authApi<NotificationsPage>(`/notifications?${query(tab, FIRST_PAGE)}`)
      .then((r) => {
        setItems((cur) => { const m = mergeFresh(cur, r.items); if (m.added) setFresh((f) => f + m.added); return m.items; });
        setCounts({ unread: r.unread, unreadByCategory: r.unreadByCategory }); sync.current(r.unread);
      })
      .catch(() => undefined); // a missed check is not an error: the next one will do
  }, [tab, state]);

  useEffect(() => {
    const id = setInterval(poll, POLL_MS);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [poll]);

  /** Mark one card read: shown at once, put back with an error if the server says no. */
  const markRead = useCallback(async (n: Notification): Promise<boolean> => {
    if (n.readAt) return true;
    const at = new Date().toISOString();
    setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, readAt: at } : i)));
    setCounts((c) => { const x = afterRead(c, n); sync.current(x.unread); return x; });
    try { await authApi(`/notifications/${n.id}/read`, { method: "POST" }); return true; }
    catch { setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, readAt: null } : i))); setCounts((c) => { const back = { unread: c.unread + 1, unreadByCategory: { payment: c.unreadByCategory.payment + (n.category === "payment" ? 1 : 0), maintenance: c.unreadByCategory.maintenance + (n.category === "maintenance" ? 1 : 0) } }; sync.current(back.unread); return back; }); return false; }
  }, []);

  const markAll = useCallback(async (): Promise<boolean> => {
    try {
      await authApi("/notifications/read-all", { method: "POST" });
      const at = new Date().toISOString();
      setItems((cur) => cur.map((i) => (i.readAt ? i : { ...i, readAt: at })));
      setCounts({ unread: 0, unreadByCategory: { payment: 0, maintenance: 0 } }); sync.current(0);
      return true;
    } catch { return false; }
  }, []);

  const reload = useCallback(() => { setState("loading"); setTick((t) => t + 1); }, []);
  return { items, hasMore: !!next, counts, state, fetching, moreError, fresh, clearFresh: () => setFresh(0), loadMore, markRead, markAll, reload };
}
