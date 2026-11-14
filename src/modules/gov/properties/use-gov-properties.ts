"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { PropertyPage, PropertyRow, Tab } from "./types";

import { FIRST_PAGE, STEP, buttonFor, lessVisible, moreVisible } from "./paging";

/**
 * The rows of one tab. The table starts with 9 rows; "View More" shows 10 more (loading them from the server when needed);
 * at the end of the list the button turns into "View Less", which takes 10 rows away per click until the first 9 are left.
 */
export function useGovProperties(tab: Tab) {
  const router = useRouter();
  const [items, setItems] = useState<PropertyRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [visible, setVisible] = useState(FIRST_PAGE);
  const [mode, setMode] = useState<"more" | "less">("more");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/gov/properties" as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    setState("loading"); setMore("idle"); setItems([]); setNext(null); setVisible(FIRST_PAGE); setMode("more");
    authApi<PropertyPage>(`/gov/properties/table?tab=${tab}&limit=${FIRST_PAGE}`)
      .then((p) => { if (id !== seq.current) return; setItems(p.items); setNext(p.nextCursor); setTotal(p.total); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); });
  }, [tab, tick, fail]);

  /** show 10 more rows; when they are not loaded yet, fetch them first */
  const viewMore = useCallback(() => {
    if (more === "loading") return;
    const want = visible + STEP;
    if (items.length >= want || !next) {
      const v = moreVisible(visible, items.length);
      setVisible(v);
      if (!next && v >= items.length) setMode("less");
      return;
    }
    const id = seq.current;
    setMore("loading");
    authApi<PropertyPage>(`/gov/properties/table?tab=${tab}&limit=${STEP}&cursor=${next}`)
      .then((p) => {
        if (id !== seq.current) return;
        const merged = [...items, ...p.items.filter((r) => !items.some((c) => c.id === r.id))];
        setItems(merged); setNext(p.nextCursor); setTotal(p.total); setMore("idle");
        const v = moreVisible(visible, merged.length);
        setVisible(v);
        if (!p.nextCursor && v >= merged.length) setMode("less");
      })
      .catch((e) => { if (id === seq.current && !fail(e)) setMore("error"); });
  }, [items, next, visible, more, tab, fail]);

  /** hide 10 rows; stops at the first 9 and then goes back to "View More" */
  const viewLess = useCallback(() => {
    const v = lessVisible(visible);
    setVisible(v);
    if (v <= FIRST_PAGE) setMode("more");
  }, [visible]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const button = buttonFor(visible, items.length, next !== null, mode);
  const canMore = button === "more";
  const canLess = button === "less";
  return { rows: items.slice(0, visible), total, state, more, canMore, canLess, viewMore, viewLess, reload };
}
