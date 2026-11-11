"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { PAGE, mergeFeed } from "./logic";
import type { FeedItem, FeedPage, Tab } from "./types";

/** The feed of one tab: ten on the first load, ten more per "Load More"; stale answers are dropped. */
export function useFeed(tab: Tab) {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const prevTab = useRef(tab);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace(`/login?next=${encodeURIComponent("/tenant/notifications")}` as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    if (prevTab.current !== tab) { prevTab.current = tab; setItems([]); setNext(null); setState("loading"); }
    else setState((s) => (s === "ready" ? s : "loading"));
    setFetching(true); setMoreError(false);
    authApi<FeedPage>(`/tenant/notifications?tab=${tab}&limit=${PAGE}`)
      .then((r) => { if (id !== seq.current) return; setItems(r.items); setNext(r.nextCursor); setUnread(r.unread); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [tab, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || fetching) return;
    const id = seq.current;
    setFetching(true); setMoreError(false);
    authApi<FeedPage>(`/tenant/notifications?tab=${tab}&limit=${PAGE}&cursor=${next}`)
      .then((r) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]); setNext(r.nextCursor); setUnread(r.unread); })
      .catch((e) => { if (!fail(e)) setMoreError(true); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [next, fetching, tab, fail]);

  /** Look again without a spinner: new notifications appear on top and the cards take their fresh live state. */
  const refresh = useCallback(() => {
    const id = seq.current;
    authApi<FeedPage>(`/tenant/notifications?tab=${tab}&limit=${PAGE}`)
      .then((r) => { if (id !== seq.current) return; setItems((cur) => mergeFeed(cur, r.items)); setUnread(r.unread); })
      .catch(() => undefined);
  }, [tab]);

  const reload = useCallback(() => { setState("loading"); setTick((n) => n + 1); }, []);
  return { items, setItems, unread, setUnread, hasMore: !!next, state, fetching, moreError, loadMore, refresh, reload };
}
