"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { applyIncoming } from "./logic";
import type { Conversation, LiveEvent } from "./types";

/** The left column: loads the chats, then keeps them current from live events (and a slow re-check as a backstop). */
export function useConversations(meId: string, activeId: string | null) {
  const router = useRouter();
  const [items, setItems] = useState<Conversation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const active = useRef(activeId);
  active.current = activeId;

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setState((s) => (s === "ready" ? s : "loading"));
    try {
      const list = await authApi<Conversation[]>("/conversations");
      setItems(list.filter((c) => c.participants.length > 0 || c.type === "SUPPORT"));
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=%2Fowner%2Fmessages" as never); return; }
      if (!quiet) setState("error");
    }
  }, [router]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) void reload(true); }, 45_000);
    const vis = () => { if (!document.hidden) void reload(true); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [reload]);

  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === "ready") void reload(true);
    else if (e.type === "message:new") {
      setItems((cur) => (cur.some((c) => c.id === e.data.conversationId) ? applyIncoming(cur, e.data.message, meId, active.current) : (void reload(true), cur)));
    } else if (e.type === "message:read" && e.data.userId === meId) {
      setItems((cur) => cur.map((c) => (c.id === e.data.conversationId ? { ...c, unread: 0 } : c)));
    } else if (e.type === "presence:update") {
      setItems((cur) => cur.map((c) => ({ ...c, participants: c.participants.map((p) => (p.id === e.data.userId ? { ...p, online: e.data.online, lastSeenAt: e.data.lastSeenAt } : p)) })));
    }
  }, [meId, reload]);

  const clearUnread = useCallback((id: string) => setItems((cur) => cur.map((c) => (c.id === id && c.unread ? { ...c, unread: 0 } : c))), []);
  return { items, state, reload, onEvent, clearUnread };
}
