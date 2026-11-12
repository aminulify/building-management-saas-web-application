"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import type { Mode, OwnerPage, StatusFilter, Tier, VerificationFilter } from "./types";

/** One page of owners (10 per page) for the mode, plan tab and search. A new filter goes back to page 1. */
export function useOwners(mode: Mode, tier: Tier, status: StatusFilter, verification: VerificationFilter, q: string) {
  const router = useRouter();
  const [data, setData] = useState<OwnerPage | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const key = `mode=${mode}&tier=${tier}&status=${status}&verification=${verification}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    const id = ++seq.current;
    setState("loading");
    authApi<OwnerPage>(`/admin/active-owners?${key}&page=${page}`)
      .then((p) => { if (id !== seq.current) return; setData(p); setState("ready"); })
      .catch((e) => {
        if (id !== seq.current) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/admin/active-owners" as never); return; }
        setState("error");
      });
  }, [key, page, tick, router]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, state, page, setPage, reload };
}
