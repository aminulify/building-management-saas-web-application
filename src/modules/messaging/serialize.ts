import type { Message } from "@prisma/client";
import { signStorageKeys } from "@/modules/uploads/service";

export interface VoiceAttachment { kind: "voice"; key: string; mime: string; size: number; durationSec: number; url?: string }
export interface CallAttachment { kind: "call"; callId: string; status: "ENDED" | "MISSED" | "REJECTED"; durationSec: number; callerId: string }
type Att = { kind?: string; key?: string } & Record<string, unknown>;

/** Messages as the page needs them: voice notes carry a short-lived playable link, nothing else about storage. */
export async function serializeMessages(rows: Message[]) {
  const keys = rows.flatMap((m) => (m.attachments as Att[]).filter((a) => a.kind === "voice" && a.key).map((a) => a.key!));
  const urls = keys.length ? await signStorageKeys(keys, 3600) : new Map<string, string>();
  return rows.map((m) => ({
    id: m.id, conversationId: m.conversationId, senderId: m.senderId, clientId: m.clientId, body: m.body, createdAt: m.createdAt,
    attachments: (m.attachments as Att[]).map((a) => (a.kind === "voice" ? { ...a, key: undefined, url: urls.get(a.key ?? "") ?? null } : a)),
  }));
}
export type ChatMessage = Awaited<ReturnType<typeof serializeMessages>>[number];
