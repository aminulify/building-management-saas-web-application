"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { PlanFilter, StatusFilter, SubPage } from "./types";

/** One page of owner plans (10 per page) for the package filter, the status filter and the Owner ID search. A new filter goes back to page 1. */
export function useSubscriptions(plan: PlanFilter, status: StatusFilter, q: string) {
  const router = useRouter();
  const [data, setData] = useState<SubPage | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = `plan=${plan}&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    const id = ++seq.current;
    setState("loading");
    authApi<SubPage>(`/admin/subscriptions?${key}&page=${page}`)
      .then((p) => { if (id !== seq.current) return; setData(p); setState("ready"); })
      .catch((e) => {
        if (id !== seq.current) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/subscriptions" as never); return; }
        setState("error");
      });
  }, [key, page, tick, router]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, state, page, setPage, reload };
}
