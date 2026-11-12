"use client";

import { useEffect, useState } from "react";
import { authApi } from "@/lib/auth-client";
import type { Contact } from "./types";

/** People the signed-in user may start a chat with, matching the typed words (waits 250 ms after typing). */
export function useContacts(q: string, enabled = true, role?: string) {
  const [items, setItems] = useState<Contact[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!enabled) { setItems([]); setState("idle"); return; }
    let live = true;
    setState("loading");
    const id = setTimeout(() => {
      authApi<Contact[]>(`/conversations/contacts?q=${encodeURIComponent(q.trim())}${role && role !== "all" ? `&role=${role}` : ""}`)
        .then((r) => { if (live) { setItems(r); setState("ready"); } })
        .catch(() => { if (live) setState("error"); });
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, enabled, role]);

  return { items, state };
}
