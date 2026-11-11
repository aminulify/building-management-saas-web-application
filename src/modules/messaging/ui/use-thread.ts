"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { upsertMessage } from "./logic";
import type { Attachment, ChatMessage, LiveEvent, MessagesPage } from "./types";

export interface Voice { blob: Blob; mime: "audio/webm" | "audio/ogg" | "audio/mp4"; durationSec: number }
interface Signed { key: string; signedUrl: string }

/** Uploads a recorded voice note to private storage and returns the attachment the message will carry. */
async function uploadVoice(v: Voice): Promise<Attachment & { key: string }> {
  const signed = await authApi<Signed>("/uploads/sign", { method: "POST", body: { purpose: "VOICE_MESSAGE", mime: v.mime, size: v.blob.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([v.blob], { type: v.mime }));
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  return { kind: "voice", key: signed.key, mime: v.mime, size: v.blob.size, durationSec: v.durationSec, url: null } as never;
}

/** The open conversation: its messages, sending (shown at once, marked failed with a retry), older pages and read ticks. */
export function useThread(conversationId: string | null, meId: string, onRead: (id: string) => void) {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [readUpTo, setReadUpTo] = useState<string | null>(null);
  const [older, setOlder] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tick, setTick] = useState(0);
  const [sendError, setSendError] = useState<"forbidden" | "rate" | "network" | "generic" | null>(null);
  const idRef = useRef(conversationId);
  idRef.current = conversationId;
  const keep = useRef(new Map<string, () => Promise<void>>());

  const markRead = useCallback((id: string) => { void authApi(`/conversations/${id}/read`, { method: "POST" }).then(() => onRead(id)).catch(() => undefined); }, [onRead]);

  useEffect(() => {
    if (!conversationId) { setItems([]); setState("idle"); return; }
    let live = true;
    setItems([]); setState("loading"); setOlder(null); setReadUpTo(null); setSendError(null);
    authApi<MessagesPage>(`/conversations/${conversationId}/messages`)
      .then((p) => { if (!live) return; setItems(p.items); setOlder(p.nextBefore); setReadUpTo(p.readUpTo); setState("ready"); markRead(conversationId); })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [conversationId, tick, markRead]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !older || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const p = await authApi<MessagesPage>(`/conversations/${conversationId}/messages?before=${older}`);
      if (idRef.current === conversationId) { setItems((cur) => [...p.items.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]); setOlder(p.nextBefore); }
    } finally { setLoadingOlder(false); }
  }, [conversationId, older, loadingOlder]);

  /** Live events for this chat. */
  const onEvent = useCallback((e: LiveEvent) => {
    const id = idRef.current;
    if (!id) return;
    if (e.type === "message:new" && e.data.conversationId === id) {
      setItems((cur) => upsertMessage(cur, e.data.message));
      if (e.data.message.senderId !== meId && !document.hidden) markRead(id);
    } else if (e.type === "message:read" && e.data.conversationId === id && e.data.userId !== meId) setReadUpTo(e.data.lastReadMessageId);
    else if (e.type === "ready") setTick((t) => t + 1);
  }, [meId, markRead]);

  // backstop for a missed live event (dropped stream, another server): look for new messages every 30 s
  useEffect(() => {
    if (!conversationId || state !== "ready") return;
    const id = setInterval(() => {
      if (document.hidden) return;
      authApi<MessagesPage>(`/conversations/${conversationId}/messages`).then((p) => {
        if (idRef.current !== conversationId) return;
        setItems((cur) => p.items.reduce((acc, m) => (acc.some((x) => x.id === m.id) ? acc : upsertMessage(acc, m)), cur));
        setReadUpTo(p.readUpTo);
        if (p.items.some((m) => m.senderId !== meId)) markRead(conversationId);
      }).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(id);
  }, [conversationId, state, meId, markRead]);

  // coming back to the tab: whatever arrived meanwhile counts as read
  useEffect(() => {
    const vis = () => { if (!document.hidden && idRef.current) markRead(idRef.current); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [markRead]);

  const post = useCallback(async (local: ChatMessage, build: () => Promise<{ body: string; attachments: Attachment[] }>) => {
    const run = async () => {
      setItems((cur) => upsertMessage(cur, { ...local, local: "sending" }));
      setSendError(null);
      try {
        const { body, attachments } = await build();
        const saved = await authApi<ChatMessage>(`/conversations/${local.conversationId}/messages`, { method: "POST", body: { clientId: local.clientId, body, attachments } });
        keep.current.delete(local.clientId);
        setItems((cur) => upsertMessage(cur, saved));
      } catch (e) {
        setSendError(e instanceof ApiError ? (e.code === "FORBIDDEN" ? "forbidden" : e.code === "RATE_LIMITED" ? "rate" : e.code === "NETWORK" ? "network" : "generic") : "generic");
        setItems((cur) => cur.map((m) => (m.clientId === local.clientId ? { ...m, local: "failed" } : m)));
      }
    };
    keep.current.set(local.clientId, run);
    await run();
  }, []);

  const draft = (text: string, attachments: Attachment[]): ChatMessage => ({
    id: `tmp-${crypto.randomUUID()}`, conversationId: conversationId!, senderId: meId, clientId: crypto.randomUUID(), body: text, createdAt: new Date().toISOString(), attachments, local: "sending",
  });

  const sendText = useCallback((text: string) => {
    if (!conversationId || !text.trim()) return Promise.resolve();
    const m = draft(text.trim(), []);
    return post(m, async () => ({ body: m.body, attachments: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, meId, post]);

  const sendVoice = useCallback((v: Voice) => {
    if (!conversationId) return Promise.resolve();
    const m = draft("", [{ kind: "voice", url: URL.createObjectURL(v.blob), mime: v.mime, size: v.blob.size, durationSec: v.durationSec }]);
    return post(m, async () => ({ body: "", attachments: [await uploadVoice(v)] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, meId, post]);

  const retry = useCallback((clientId: string) => { void keep.current.get(clientId)?.(); }, []);
  return { items, state, readUpTo, sendError, clearSendError: () => setSendError(null), hasOlder: !!older, loadingOlder, loadOlder, onEvent, sendText, sendVoice, retry, reload: () => setTick((t) => t + 1) };
}
