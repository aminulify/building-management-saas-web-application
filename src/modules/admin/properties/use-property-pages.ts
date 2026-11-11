"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { AdminPropertyState } from "./status";
import type { PropertyPage, PropertyRow, Tab } from "./types";

export const FIRST_PAGE = 9;
export const NEXT_PAGE = 10;

const stays = (tab: Tab, s: AdminPropertyState) => tab === "all" || (tab === "active" ? s === "ACTIVE" : s === "PENDING");

/** The table rows of one tab: 9 first, then 10 more at a time. A row can be changed or removed in place after an edit, without reloading the list. */
export function usePropertyPages(tab: Tab) {
  const router = useRouter();
  const [items, setItems] = useState<PropertyRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/properties" as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    setState("loading"); setMore("idle"); setItems([]); setNext(null);
    authApi<PropertyPage>(`/admin/properties/table?tab=${tab}&limit=${FIRST_PAGE}`)
      .then((p) => { if (id !== seq.current) return; setItems(p.items); setNext(p.nextCursor); setTotal(p.total); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); });
  }, [tab, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || more === "loading") return;
    const id = seq.current;
    setMore("loading");
    authApi<PropertyPage>(`/admin/properties/table?tab=${tab}&limit=${NEXT_PAGE}&cursor=${next}`)
      .then((p) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...p.items.filter((r) => !cur.some((c) => c.id === r.id))]); setNext(p.nextCursor); setTotal(p.total); setMore("idle"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setMore("error"); });
  }, [next, more, tab, fail]);

  /** after an Active / Pending change: the badge changes, and the row leaves a tab it no longer belongs to */
  const applyState = useCallback((id: string, s: AdminPropertyState) => {
    const row = items.find((r) => r.id === id);
    if (!row) return;
    if (stays(tab, s)) setItems(items.map((r) => (r.id === id ? { ...r, state: s } : r)));
    else { setItems(items.filter((r) => r.id !== id)); setTotal((n) => Math.max(0, n - 1)); }
  }, [items, tab]);

  const remove = useCallback((id: string) => {
    if (!items.some((r) => r.id === id)) return;
    setItems(items.filter((r) => r.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  }, [items]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { items, total, state, more, hasMore: next !== null, loadMore, reload, applyState, remove };
}
