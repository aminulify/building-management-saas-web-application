"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export interface Zone { id: string; nameEn: string; nameBn: string; upazilaId: string }

let cache: Zone[] | null = null;

/** Named areas (Mirpur DOHS, Uttara, Sylhet Sadar…) for the Zone dropdowns, loaded once from /geo/zones. */
export function useZones() {
  const [zones, setZones] = useState<Zone[]>(cache ?? []);
  const [state, setState] = useState<"loading" | "ready" | "error">(cache ? "ready" : "loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (cache) return;
    let off = false;
    setState("loading");
    api<Zone[]>("/geo/zones")
      .then((z) => { cache = z; if (!off) { setZones(z); setState("ready"); } })
      .catch(() => { if (!off) setState("error"); });
    return () => { off = true; };
  }, [tick]);
  return { zones, state, retry: () => setTick((n) => n + 1) };
}
