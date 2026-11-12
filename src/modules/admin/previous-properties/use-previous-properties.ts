"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { ArchivePage, ReasonFilter, StatusFilter } from "./types";

/** One page of Previous Properties (10 per page). A new filter or search goes back to page 1. */
export function usePreviousProperties(status: StatusFilter, reason: ReasonFilter, q: string) {
  const router = useRouter();
  const [data, setData] = useState<ArchivePage | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = `status=${status}&reason=${reason}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    const id = ++seq.current;
    setState("loading");
    authApi<ArchivePage>(`/admin/previous-properties?${key}&page=${page}`)
      .then((p) => {
        if (id !== seq.current) return;
        // the last page can disappear after a delete or reactivation: step back
        if (p.items.length === 0 && p.total > 0 && page > 1) { setPage(Math.ceil(p.total / p.pageSize)); return; }
        setData(p); setState("ready");
      })
      .catch((e) => {
        if (id !== seq.current) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/previous-properties" as never); return; }
        setState("error");
      });
  }, [key, page, tick, router]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, state, page, setPage, reload };
}
