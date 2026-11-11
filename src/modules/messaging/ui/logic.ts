import type { ChatMessage, Conversation, Person } from "./types";

/** The person on the other end (every chat here is between two people). */
export const otherOf = (c: Conversation): Person | null => c.participants[0] ?? null;

/** "Search chats": tenant name, username, unit number or property name, as you type. */
export function matchesQuery(c: Conversation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const p = otherOf(c);
  return !!p && [p.fullName, p.username, p.unit, p.property].some((x) => !!x && x.toLowerCase().includes(needle));
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";

/** 125 → "2:05" */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which wording a list time takes: a clock time today, "Yesterday", or a date. */
export function stampKind(iso: string, now = Date.now()): "time" | "yesterday" | "date" {
  const days = Math.round((dayStart(new Date(now)) - dayStart(new Date(iso))) / 86_400_000);
  return days <= 0 ? "time" : days === 1 ? "yesterday" : "date";
}

/** Divider label kind: today / yesterday / a full date. */
export const dividerKind = (iso: string, now = Date.now()) => { const k = stampKind(iso, now); return k === "time" ? "today" : k; };

export interface DayGroup { key: string; iso: string; items: ChatMessage[] }

/** Messages in time order, split by calendar day for the centred date pills. */
export function groupByDay(messages: ChatMessage[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m); else out.push({ key, iso: m.createdAt, items: [m] });
  }
  return out;
}

/** Add or replace a message: our own optimistic copy is swapped for the saved one (same clientId), duplicates are ignored. */
export function upsertMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = list.findIndex((m) => m.id === msg.id || (m.senderId === msg.senderId && m.clientId === msg.clientId));
  if (i >= 0) { const next = list.slice(); next[i] = { ...msg, local: undefined }; return next; }
  return [...list, msg].sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
}

/** New message in some chat: preview, time, unread count and order of the left column. */
export function applyIncoming(list: Conversation[], msg: ChatMessage, meId: string, activeId: string | null): Conversation[] {
  const i = list.findIndex((c) => c.id === msg.conversationId);
  if (i < 0) return list;
  const kind = msg.attachments.some((a) => a.kind === "voice") ? "voice" : msg.attachments.some((a) => a.kind === "call") ? "call" : "text";
  const c = list[i]!;
  const mine = msg.senderId === meId;
  const updated: Conversation = {
    ...c, lastMessage: { id: msg.id, body: msg.body, senderId: msg.senderId, createdAt: msg.createdAt, kind },
    unread: mine || activeId === c.id ? c.unread : c.unread + 1,
  };
  return [updated, ...list.filter((_, j) => j !== i)];
}

/** ✓✓ turns blue once the other person has read up to this message (ids are time-ordered, so a plain comparison works). */
export const isRead = (m: ChatMessage, readUpTo: string | null) => !!readUpTo && !m.local && m.id <= readUpTo;

/** A stable pseudo-waveform for voice notes: the same message always draws the same bars. */
export function waveBars(seed: string, n = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  for (let i = 0; i < n; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out.push(0.25 + ((h >>> 0) % 1000) / 1000 * 0.75); }
  return out;
}

/** Only these two audio types are kept; MediaRecorder reports things like "audio/webm;codecs=opus". */
export function voiceMime(raw: string): "audio/webm" | "audio/ogg" | "audio/mp4" | null {
  const base = raw.split(";")[0]!.trim().toLowerCase();
  return base === "audio/webm" || base === "audio/ogg" || base === "audio/mp4" ? base : null;
}
export const VOICE_MAX_SEC = 300;
