import type { CallRequestStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { loadConversation } from "./access";
import type { CallAction, callRequestSchema } from "./schema";

const MIN_LEAD_MS = 5 * 60_000;
const MAX_LEAD_MS = 30 * 86400_000;

/**
 * "Call later": schedule a callback with the other person in a conversation.
 * Live audio/video is a later version; this stores the request, notifies, and tracks its lifecycle.
 */
export async function requestCall(actor: Actor, input: z.infer<typeof callRequestSchema>) {
  const conv = await loadConversation(actor, input.conversationId);
  if (conv.type === "SUPPORT") throw new AppError("INVALID_STATE", { reason: "not_for_support" });
  const recipient = conv.participants.find((p) => p.userId !== actor.id);
  if (!recipient || !conv.participants.some((p) => p.userId === actor.id)) throw new AppError("NOT_FOUND");

  const lead = input.scheduledFor.getTime() - Date.now();
  if (lead < MIN_LEAD_MS || lead > MAX_LEAD_MS) throw new AppError("VALIDATION_ERROR", [{ path: "scheduledFor", code: "out_of_range" }]);
  const open = await db.callRequest.count({ where: { requesterId: actor.id, status: { in: ["PENDING", "ACCEPTED"] } } });
  if (open >= 5) throw new AppError("RATE_LIMITED", { reason: "too_many_open_call_requests" });

  const cr = await db.callRequest.create({
    data: { conversationId: conv.id, requesterId: actor.id, recipientId: recipient.userId, kind: input.kind, scheduledFor: input.scheduledFor, note: input.note },
  });
  await notify([recipient.userId], { type: "call.requested", titleKey: "notifications.callRequested", params: { from: actor.fullName, at: input.scheduledFor.toISOString() }, link: `/messages/${conv.id}`, priority: "HIGH" });
  return cr;
}

export async function listCallRequests(actor: Actor, status?: CallRequestStatus) {
  return db.callRequest.findMany({
    where: { OR: [{ requesterId: actor.id }, { recipientId: actor.id }], status: status ?? { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { scheduledFor: "asc" }, take: 50,
  });
}

const RULES: Record<CallAction, { from: CallRequestStatus[]; to: CallRequestStatus; by: "recipient" | "requester" | "either" }> = {
  accept: { from: ["PENDING"], to: "ACCEPTED", by: "recipient" },
  decline: { from: ["PENDING"], to: "DECLINED", by: "recipient" },
  cancel: { from: ["PENDING", "ACCEPTED"], to: "CANCELLED", by: "requester" },
  done: { from: ["ACCEPTED"], to: "DONE", by: "either" },
};

export async function actOnCall(actor: Actor, id: string, action: CallAction) {
  const cr = await db.callRequest.findUnique({ where: { id } });
  if (!cr || (cr.requesterId !== actor.id && cr.recipientId !== actor.id)) throw new AppError("NOT_FOUND");
  const rule = RULES[action];
  const ok = rule.by === "either" || (rule.by === "recipient" ? cr.recipientId === actor.id : cr.requesterId === actor.id);
  if (!ok) throw new AppError("FORBIDDEN", { action });
  if (!rule.from.includes(cr.status)) throw new AppError("INVALID_STATE", { from: cr.status, action });

  const out = await db.callRequest.update({ where: { id }, data: { status: rule.to } });
  const other = cr.requesterId === actor.id ? cr.recipientId : cr.requesterId;
  await notify([other], { type: "call.updated", titleKey: "notifications.callUpdated", params: { status: rule.to, by: actor.fullName }, link: `/messages/${cr.conversationId}` });
  return out;
}
