"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { FreePage, FreeTab } from "./types";

/** One page of Tenant-Free accounts (10 per page) for the NID tab and the search. A new tab or search goes back to page 1. */
export function useFree(tab: FreeTab, q: string) {
  const router = useRouter();
  const [data, setData] = useState<FreePage | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = `tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    const id = ++seq.current;
    setState("loading");
    authApi<FreePage>(`/admin/tenant-free?${key}&page=${page}`)
      .then((p) => { if (id !== seq.current) return; setData(p); setState("ready"); })
      .catch((e) => {
        if (id !== seq.current) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/tenant-free" as never); return; }
        setState("error");
      });
  }, [key, page, tick, router]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, state, page, setPage, reload };
}
