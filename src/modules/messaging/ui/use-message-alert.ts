"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/auth-client";
import { alertOn, readAck, writeAck } from "./alert-logic";

/**
 * Persistent red alert for the Message button. It stays on, also after a page reload, until the person clicks the button.
 * Messages that came while they were away are counted by the server; the click is remembered in this browser.
 */
export function useMessageAlert(meId: string) {
  const [count, setCount] = useState(0);
  const [latest, setLatest] = useState(0);
  const [ack, setAck] = useState(0);
  const latestRef = useRef(0);
  latestRef.current = latest;

  useEffect(() => { setAck(readAck(meId)); }, [meId]);

  const refresh = useCallback(() => {
    authApi<{ count: number; latestAt: string | null }>("/conversations/unread")
      .then((r) => { setCount(r.count); setLatest(r.latestAt ? Date.parse(r.latestAt) : 0); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    const look = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [refresh]);

  /** A new message arrived live. */
  const incoming = useCallback((createdAt: string) => {
    const ms = Date.parse(createdAt) || Date.now();
    setCount((n) => n + 1);
    setLatest((l) => Math.max(l, ms));
  }, []);

  /** The person clicked the Message button: the alert goes off until the next new message. */
  const acknowledge = useCallback(() => {
    const ms = Math.max(Date.now(), latestRef.current);
    writeAck(meId, ms);
    setAck(ms);
  }, [meId]);

  return { on: alertOn(count, latest, ack), count, refresh, incoming, acknowledge };
}
