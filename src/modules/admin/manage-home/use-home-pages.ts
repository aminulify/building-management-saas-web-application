"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { ModerationState } from "./state";
import type { HomeFilters, HomePage, HomeRow } from "./types";

export const FIRST_PAGE = 9;
export const NEXT_PAGE = 10;

const query = (f: HomeFilters) => `mode=${f.mode}&status=${f.status}${f.mode === "rent" ? `&occupancy=${f.occupancy}` : `&sale=${f.sale}`}${f.q ? `&q=${encodeURIComponent(f.q)}` : ""}${f.category && f.category !== "all" ? `&category=${f.category}` : ""}${f.featured === "yes" ? "&featured=yes" : ""}`;
const matches = (status: HomeFilters["status"], s: ModerationState) => status === "all" || status === s.toLowerCase();

/** Rows of the table for the chosen filters: 9 first, then 10 more per "View More". A row can change or leave in place after an edit or delete. */
export function useHomePages(f: HomeFilters) {
  const router = useRouter();
  const [items, setItems] = useState<HomeRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = query(f);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/manage-home" as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    setState("loading"); setMore("idle"); setItems([]); setNext(null);
    authApi<HomePage>(`/admin/manage-home/table?${key}&limit=${FIRST_PAGE}`)
      .then((p) => { if (id !== seq.current) return; setItems(p.items); setNext(p.nextCursor); setTotal(p.total); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); });
  }, [key, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || more === "loading") return;
    const id = seq.current;
    setMore("loading");
    authApi<HomePage>(`/admin/manage-home/table?${key}&limit=${NEXT_PAGE}&cursor=${next}`)
      .then((p) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...p.items.filter((r) => !cur.some((c) => c.id === r.id))]); setNext(p.nextCursor); setTotal(p.total); setMore("idle"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setMore("error"); });
  }, [next, more, key, fail]);

  /** after a status change: the badge changes, and the row leaves a filter it no longer matches */
  const applyState = useCallback((id: string, s: ModerationState, sold?: boolean) => {
    const row = items.find((r) => r.id === id);
    if (!row) return;
    const nowSold = sold ?? row.sold;
    const saleOk = f.mode !== "sale" || f.sale === "all" || (f.sale === "sold" ? nowSold : !nowSold);
    if (matches(f.status, s) && saleOk && !(f.featured === "yes" && (s !== "ACTIVE" || nowSold))) setItems(items.map((r) => (r.id === id ? { ...r, state: s, sold: nowSold, status: nowSold ? "SOLD" : s === "ACTIVE" ? "PUBLISHED" : r.status, isFeatured: s === "ACTIVE" && !nowSold ? r.isFeatured : false } : r)));
    else { setItems(items.filter((r) => r.id !== id)); setTotal((n) => Math.max(0, n - 1)); }
  }, [items, f.mode, f.status, f.sale, f.featured]);

  const remove = useCallback((id: string) => {
    if (!items.some((r) => r.id === id)) return;
    setItems(items.filter((r) => r.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  }, [items]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  /** feature / unfeature in place; with the "Featured only" filter on, an unfeatured card leaves the list */
  const applyFeatured = useCallback((id: string, isFeatured: boolean) => {
    if (!items.some((r) => r.id === id)) return;
    if (!isFeatured && f.featured === "yes") { setItems(items.filter((r) => r.id !== id)); setTotal((n) => Math.max(0, n - 1)); }
    else setItems(items.map((r) => (r.id === id ? { ...r, isFeatured } : r)));
  }, [items, f.featured]);

  return { items, total, state, more, hasMore: next !== null, loadMore, reload, applyState, applyFeatured, remove };
}
