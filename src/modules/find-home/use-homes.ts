"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { currentArea } from "./area";
import { priceRangeInvalid, toQuery } from "./filters";
import type { Filters, HomeCardData, HomesPage } from "./types";

export type HomesState = "loading" | "ready" | "error";

/**
 * The result list: first page whenever the filters change (price typing is debounced), "load more" appends the next
 * page, stale answers are dropped, and a 401 sends the visitor to sign-in like every other owner page.
 */
export function useHomes(filters: Filters, limit?: number) {
  const router = useRouter();
  const [items, setItems] = useState<HomeCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<HomesState>("loading");
  const [fetching, setFetching] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const key = toQuery(filters, null, limit);
  const invalid = priceRangeInvalid(filters);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace(`/login?next=${encodeURIComponent(`${currentArea()}/find-home`)}` as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    if (invalid) return; // a min above the max is explained in the filter card; keep the last list
    const id = ++seq.current;
    const timer = setTimeout(() => {
      setFetching(true); setMoreError(false);
      authApi<HomesPage>(`/listings?${key}`)
        .then((r) => { if (id !== seq.current) return; setItems(r.items); setTotal(r.total); setNext(r.nextCursor); setState("ready"); })
        .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); })
        .finally(() => { if (id === seq.current) setFetching(false); });
    }, 280);
    return () => clearTimeout(timer);
  }, [key, invalid, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || fetching) return;
    const id = seq.current;
    setFetching(true); setMoreError(false);
    authApi<HomesPage>(`/listings?${toQuery(filters, next, limit)}`)
      .then((r) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]); setTotal(r.total); setNext(r.nextCursor); })
      .catch((e) => { if (!fail(e)) setMoreError(true); })
      .finally(() => { if (id === seq.current) setFetching(false); });
  }, [next, fetching, filters, limit, fail]);

  /** change one card in place (wishlist heart) without reloading the list */
  const patch = useCallback((id: string, p: Partial<HomeCardData>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i))), []);
  const reload = useCallback(() => { setState("loading"); setTick((n) => n + 1); }, []);

  return { items, total, hasMore: !!next, state, fetching, moreError, loadMore, patch, reload };
}
