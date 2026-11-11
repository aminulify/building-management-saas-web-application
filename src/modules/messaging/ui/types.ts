export interface Person {
  id: string; fullName: string; username: string; role: string; avatarUrl: string | null;
  online: boolean; lastSeenAt: string | null; unit: string | null; property: string | null;
}

export type PreviewKind = "text" | "voice" | "call";
export interface LastMessage { id: string; body: string; senderId: string; createdAt: string; kind: PreviewKind }

export interface Conversation {
  id: string; type: "DIRECT" | "SUPPORT" | "LISTING_INQUIRY" | "INSPECTION"; listingId: string | null;
  pinned: boolean; unread: number; lastMessage: LastMessage | null; participants: Person[];
}

export interface VoiceAtt { kind: "voice"; url: string | null; mime: string; size: number; durationSec: number }
export interface CallAtt { kind: "call"; callId: string; status: "ENDED" | "MISSED" | "REJECTED"; durationSec: number; callerId: string }
export type Attachment = VoiceAtt | CallAtt | { kind?: undefined; mime: string; size: number };

export interface ChatMessage {
  id: string; conversationId: string; senderId: string; clientId: string; body: string; createdAt: string;
  attachments: Attachment[];
  /** only on this device: sending / failed */
  local?: "sending" | "failed";
}

export interface MessagesPage { items: ChatMessage[]; nextBefore: string | null; readUpTo: string | null }
export type Contact = Omit<Person, "lastSeenAt">;

/** Events the server pushes (src/modules/messaging/hub.ts). */
export type LiveEvent =
  | { type: "message:new"; data: { conversationId: string; message: ChatMessage } }
  | { type: "message:read"; data: { conversationId: string; userId: string; lastReadMessageId: string } }
  | { type: "presence:update"; data: { userId: string; online: boolean; lastSeenAt: string } }
  | { type: "call:incoming"; data: { callId: string; conversationId: string; caller: { id: string; fullName: string; avatarUrl: string | null } } }
  | { type: "call:accepted"; data: { callId: string } }
  | { type: "call:ended"; data: { callId: string; status: string; durationSec: number } }
  | { type: "call:signal"; data: { callId: string; kind: "offer" | "answer" | "ice"; payload: unknown } }
  | { type: "ready"; data: Record<string, never> };
