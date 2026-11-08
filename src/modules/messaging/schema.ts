import { z } from "zod";
import { uuid } from "@/lib/api/common";

export const openConversationSchema = z
  .object({
    type: z.enum(["DIRECT", "SUPPORT", "INSPECTION"]).default("DIRECT"),
    recipientId: uuid.optional(),
  })
  .refine((v) => v.type === "SUPPORT" || !!v.recipientId, { message: "recipient_required", path: ["recipientId"] });

export const sendMessageSchema = z.object({
  clientId: uuid,
  body: z.string().trim().min(1).max(2000),
  attachments: z
    .array(z.object({ key: z.string().min(3).max(300), mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), size: z.number().int().max(10 * 1024 * 1024) }))
    .max(5)
    .default([]),
});

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
