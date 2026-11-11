"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, refreshStoredSession } from "@/lib/auth-client";
import type { LiveEvent } from "./types";

export type LiveState = "connecting" | "live" | "offline";

/** Splits a Server-Sent-Events text stream into `{event, data}` frames. */
export function parseFrames(buffer: string): { frames: { event: string; data: string }[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames = parts.flatMap((p) => {
    let event = "message"; const data: string[] = [];
    for (const line of p.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    return data.length ? [{ event, data: data.join("\n") }] : [];
  });
  return { frames, rest };
}

/**
 * One live connection to /api/v1/events while the page is open. It reconnects by itself (1 s → 10 s) and, once it is
 * back, sends a "ready" event so the page can fetch what it missed.
 */
export function useLiveEvents(onEvent: (e: LiveEvent) => void): LiveState {
  const [state, setState] = useState<LiveState>("connecting");
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const ctrl = new AbortController();
    let delay = 1000;

    async function run() {
      while (!ctrl.signal.aborted) {
        try {
          let s = getSession();
          if (!s) return;
          if (s.expiresAt && s.expiresAt * 1000 - Date.now() < 60_000) s = (await refreshStoredSession()) ?? s;
          const res = await fetch("/api/v1/events", { headers: { authorization: `Bearer ${s.accessToken}`, accept: "text/event-stream" }, signal: ctrl.signal, cache: "no-store" });
          if (res.status === 401) { await refreshStoredSession(); throw new Error("unauthorized"); }
          if (!res.ok || !res.body) throw new Error(`stream_${res.status}`);
          setState("live"); delay = 1000;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const { frames, rest } = parseFrames(buf);
            buf = rest;
            for (const f of frames) { try { handler.current({ type: f.event, data: JSON.parse(f.data) } as LiveEvent); } catch { /* one bad frame must not stop the stream */ } }
          }
        } catch {
          if (ctrl.signal.aborted) return;
        }
        setState("offline");
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 10_000);
        if (!ctrl.signal.aborted) setState("connecting");
      }
    }
    void run();
    return () => ctrl.abort();
  }, []);

  return state;
}
