"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";

/** Loads what a story needs (receipt, repair request, incident log) from its own endpoint. */
export function useDetail<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setState("loading");
    authApi<T>(path)
      .then((d) => { if (!off) { setData(d); setState("ready"); } })
      .catch((e) => { if (!off) setState(e instanceof ApiError && (e.status === 404 || e.status === 403) ? "gone" : "error"); });
    return () => { off = true; };
  }, [path, tick]);
  return { data, state, setData, retry: () => setTick((n) => n + 1) };
}
