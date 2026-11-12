import { z } from "zod";
import { uuid } from "@/lib/api/common";

export const openConversationSchema = z
  .object({
    type: z.enum(["DIRECT", "SUPPORT", "INSPECTION"]).default("DIRECT"),
    recipientId: uuid.optional(),
  })
  .refine((v) => v.type === "SUPPORT" || !!v.recipientId, { message: "recipient_required", path: ["recipientId"] });

export const VOICE_MIMES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
export const MAX_VOICE_SEC = 300;

const fileAttachment = z.object({ key: z.string().min(3).max(300), mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), size: z.number().int().max(10 * 1024 * 1024) });
const voiceAttachment = z.object({
  kind: z.literal("voice"), key: z.string().min(3).max(300).startsWith("VOICE_MESSAGE/"), mime: z.enum(VOICE_MIMES),
  size: z.number().int().positive().max(5 * 1024 * 1024), durationSec: z.number().int().min(1).max(MAX_VOICE_SEC),
});

/** A message is text, a voice note, or both; an empty message is refused. */
export const sendMessageSchema = z
  .object({
    clientId: uuid,
    body: z.string().trim().max(2000).default(""),
    attachments: z.array(z.union([voiceAttachment, fileAttachment])).max(5).default([]),
  })
  .refine((v) => v.body.length > 0 || v.attachments.length > 0, { message: "empty_message", path: ["body"] });

export const CONTACT_ROLES = ["GENERAL_USER", "TENANT", "OWNER", "GOV_ADMIN"] as const;
/** `role` lets a Super Admin / Government Admin browse one kind of person (Tenant Free, Tenants, Owners, Government) without typing a name. */
export const contactsQuery = z.object({ q: z.string().trim().max(100).optional(), role: z.enum(CONTACT_ROLES).optional() });

export const startCallSchema = z.object({ conversationId: uuid });
export const callSignalSchema = z.object({ data: z.object({ kind: z.enum(["offer", "answer", "ice"]), payload: z.unknown() }) });
export const CALL_LIVE_ACTIONS = ["accept", "reject", "end", "missed"] as const;
export type CallLiveAction = (typeof CALL_LIVE_ACTIONS)[number];

export const messagesQuery = z.object({ before: uuid.optional(), q: z.string().trim().min(1).max(100).optional() });

export const presenceQuery = z.object({
  userIds: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(uuid).min(1).max(50)),
});

export const callRequestSchema = z.object({
  conversationId: uuid,
  scheduledFor: z.coerce.date(),
  kind: z.enum(["AUDIO", "VIDEO"]).default("AUDIO"),
  note: z.string().trim().max(300).optional(),
});

export const callRequestListQuery = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "DONE"]).optional(),
});

export const CALL_ACTIONS = ["accept", "decline", "cancel", "done"] as const;
export type CallAction = (typeof CALL_ACTIONS)[number];
