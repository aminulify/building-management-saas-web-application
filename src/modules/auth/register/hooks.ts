"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";

/* ---------- geography lists (public API, cached per path) ---------- */
export interface GeoItem { id: string; nameEn: string; nameBn: string }
const cache = new Map<string, GeoItem[]>();

export function useGeoList(path: string | null) {
  const [state, setState] = useState<{ items: GeoItem[]; loading: boolean; error: boolean }>({ items: [], loading: false, error: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) { setState({ items: [], loading: false, error: false }); return; }
    const hit = cache.get(path);
    if (hit) { setState({ items: hit, loading: false, error: false }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: false }));
    api<GeoItem[]>(path, { signal: ctrl.signal })
      .then((items) => { cache.set(path, items); setState({ items, loading: false, error: false }); })
      .catch((e) => { if ((e as Error).name !== "AbortError") setState({ items: [], loading: false, error: true }); });
    return () => ctrl.abort();
  }, [path, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/* ---------- live "already taken?" check ---------- */
export type Availability = "idle" | "checking" | "available" | "taken" | "error";

/** Debounced (500 ms). Only asks the server when the value is already well-formed (`valid`). */
export function useAvailability(kind: "username" | "email" | "phone", value: string, valid: boolean): Availability {
  const [state, setState] = useState<Availability>("idle");

  useEffect(() => {
    if (!valid || !value) { setState("idle"); return; }
    setState("checking");
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api<Partial<Record<typeof kind, boolean>>>(`/auth/availability?${kind}=${encodeURIComponent(value)}`, { signal: ctrl.signal })
        .then((r) => setState(r[kind] === false ? "taken" : "available"))
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          // a rate limit or outage must never block the user; the server re-checks on submit
          setState(e instanceof ApiError && e.status === 429 ? "idle" : "error");
        });
    }, 500);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [kind, value, valid]);

  return state;
}
