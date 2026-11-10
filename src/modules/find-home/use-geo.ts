"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { GeoItem } from "./types";

type Level = "divisions" | "districts" | "upazilas" | "unions";

/** Answers are kept for the life of the page (the server also caches them for a day). */
const memo = new Map<string, GeoItem[]>();

export async function loadGeo(level: Level, parent?: string): Promise<GeoItem[]> {
  const key = `${level}:${parent ?? ""}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const data = await api<GeoItem[]>(`/geo/bd?level=${level}${parent ? `&parent=${parent}` : ""}`);
  memo.set(key, data);
  return data;
}

/** One dropdown of the cascade: loads when its parent is chosen, empty while there is no parent. */
export function useGeoList(level: Level, parentId: string | null) {
  const needsParent = level !== "divisions";
  const [items, setItems] = useState<GeoItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (needsParent && !parentId) { setItems([]); setState("idle"); return; }
    let cancelled = false;
    setState("loading");
    loadGeo(level, parentId ?? undefined)
      .then((d) => { if (!cancelled) { setItems(d); setState("ready"); } })
      .catch(() => { if (!cancelled) { setItems([]); setState("error"); } });
    return () => { cancelled = true; };
  }, [level, parentId, needsParent, tick]);

  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { items, state, retry };
}
