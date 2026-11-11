"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { PlanPage, PlanRow, Segment } from "./types";

export const FIRST_PAGE = 9;
export const NEXT_PAGE = 10;

/** The Active Plans list of one segment: the first 9 rows, then 10 more at a time appended below. A new segment starts over. */
export function usePlanPages(segment: Segment) {
  const router = useRouter();
  const [items, setItems] = useState<PlanRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/dashboard" as never); return true; }
    return false;
  }, [router]);

  useEffect(() => {
    const id = ++seq.current;
    setState("loading"); setMore("idle"); setItems([]); setNext(null);
    authApi<PlanPage>(`/dashboard/admin/active-plans?segment=${segment}&limit=${FIRST_PAGE}`)
      .then((p) => { if (id !== seq.current) return; setItems(p.items); setNext(p.nextCursor); setTotal(p.total); setState("ready"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setState("error"); });
  }, [segment, tick, fail]);

  const loadMore = useCallback(() => {
    if (!next || more === "loading") return;
    const id = seq.current;
    setMore("loading");
    authApi<PlanPage>(`/dashboard/admin/active-plans?segment=${segment}&limit=${NEXT_PAGE}&cursor=${next}`)
      .then((p) => { if (id !== seq.current) return; setItems((cur) => [...cur, ...p.items.filter((r) => !cur.some((c) => c.id === r.id))]); setNext(p.nextCursor); setTotal(p.total); setMore("idle"); })
      .catch((e) => { if (id === seq.current && !fail(e)) setMore("error"); });
  }, [next, more, segment, fail]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { items, total, state, more, hasMore: next !== null, loadMore, reload };
}
