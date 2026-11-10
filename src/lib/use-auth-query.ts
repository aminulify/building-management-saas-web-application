"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "./api-client";
import { authApi, clearSession } from "./auth-client";

export type QueryState = "loading" | "ready" | "error";

/**
 * GET a signed-in endpoint. Keeps the previous data while a new request (e.g. another year) loads,
 * and sends the visitor to sign-in when the session is gone. `path = null` pauses the query.
 */
export function useAuthQuery<T>(path: string | null) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<QueryState>("loading");
  const [fetching, setFetching] = useState(false);
  const [tick, setTick] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    if (!hasData.current) setState("loading");
    setFetching(true);
    authApi<T>(path)
      .then((d) => { if (!cancelled) { hasData.current = true; setData(d); setState("ready"); } })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace(`/login?next=${encodeURIComponent(window.location.pathname.replace(/^\/(bn|en)/, ""))}` as never); return; }
        setState("error");
      })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [path, tick, router]);

  const reload = useCallback(() => setTick((n) => n + 1), []); // keeps showing the current data while it refreshes
  return { data, state, fetching, reload };
}
