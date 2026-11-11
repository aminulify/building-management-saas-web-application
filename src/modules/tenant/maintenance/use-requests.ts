"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { listQuery } from "./logic";
import type { Issue, IssuesPage, Tab } from "./types";

/** The tenant's requests: three on the first load of a tab, five more per "Load More"; stale answers are dropped. */
export function useRequests(tab: Tab) {
  const router = useRouter();
  const [items, setItems] = useState<Issue[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const prevTab = useRef(tab);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace(`/login?next=${encodeURIComponent("/tenant/maintenance")}` as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    if (prevTab.current !== tab) { prevTab.current = tab; setItems([]); setNext(null); setState("loading"); }
    else setState((s) => (s === "ready" ? s : "loading"));
    setFetching(true); setMoreError(false);
    authApi<IssuesPage>(`/maintenance?${listQuery(tab)}`)
      .then((r) => { if (id !== seq.current) return; setItems(r.items); setNext(r.nextCursor); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [tab, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || fetching) return;
    const id = seq.current;
    setFetching(true); setMoreError(false);
    authApi<IssuesPage>(`/maintenance?${listQuery(tab, next)}`)
      .then((r) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]); setNext(r.nextCursor); })
      .catch((e) => { if (!fail(e)) setMoreError(true); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [next, fetching, tab, fail]);

  const patch = useCallback((id: string, p: Partial<Issue>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i))), []);
  const remove = useCallback((id: string) => setItems((cur) => cur.filter((i) => i.id !== id)), []);
  const prepend = useCallback((i: Issue) => setItems((cur) => [i, ...cur.filter((c) => c.id !== i.id)]), []);
  const reload = useCallback(() => { setState("loading"); setTick((n) => n + 1); }, []);

  return { items, hasMore: !!next, state, fetching, moreError, loadMore, patch, remove, prepend, reload };
}
