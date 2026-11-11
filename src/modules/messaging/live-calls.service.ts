import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { loadConversation } from "./access";
import { isConnected, publish } from "./hub";
import { serializeMessages } from "./serialize";
import { assertCanTalk, avatarUrls } from "./service";
import type { CallLiveAction, callSignalSchema } from "./schema";

const RING_MS = 60_000;
const TALK_MAX_MS = 4 * 3600_000;
const LIVE = ["RINGING", "ACCEPTED"] as const;

/** Rows have no created-at column; ids are time-ordered uuid v7, whose first 48 bits are the creation time. */
const createdAt = (id: string) => parseInt(id.replace(/-/g, "").slice(0, 12), 16);

/** Close calls nobody ended properly (browser closed): ringing for over a minute is missed, talking for over 4 hours is over. */
async function sweep(userIds: string[]) {
  const rows = await db.call.findMany({ where: { status: { in: [...LIVE] }, OR: [{ callerId: { in: userIds } }, { calleeId: { in: userIds } }] } });
  const now = Date.now();
  for (const c of rows) {
    if (c.status === "RINGING" && now - createdAt(c.id) > RING_MS) await finish(c.id, "MISSED");
    else if (c.status === "ACCEPTED" && now - (c.startedAt?.getTime() ?? createdAt(c.id)) > TALK_MAX_MS) await finish(c.id, "ENDED");
  }
}

/** Close the call row, add the "voice call · 2:31 / missed call" line to the chat and tell both people. */
async function finish(callId: string, status: "ENDED" | "MISSED" | "REJECTED") {
  const call = await db.call.findUnique({ where: { id: callId } });
  if (!call || (call.status !== "RINGING" && call.status !== "ACCEPTED")) return null;
  const endedAt = new Date();
  const durationSec = call.status === "ACCEPTED" && call.startedAt ? Math.max(1, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)) : 0;
  const closed = await db.call.updateMany({ where: { id: callId, status: call.status }, data: { status, endedAt } });
  if (closed.count === 0) return null; // someone else ended it first
  const msg = await db.message.create({
    data: { conversationId: call.conversationId, senderId: call.callerId, clientId: `call-${callId}`, body: "", attachments: [{ kind: "call", callId, status, durationSec, callerId: call.callerId }] },
  });
  await db.conversation.update({ where: { id: call.conversationId }, data: { lastMessageAt: msg.createdAt } });
  const [out] = await serializeMessages([msg]);
  publish([call.callerId, call.calleeId], { type: "message:new", data: { conversationId: call.conversationId, message: out } });
  publish([call.callerId, call.calleeId], { type: "call:ended", data: { callId, status, durationSec } });
  if (status === "MISSED") {
    const caller = await db.user.findUnique({ where: { id: call.callerId }, select: { fullName: true } });
    await notify([call.calleeId], { type: "call.missed", titleKey: "notifications.callMissed", params: { from: caller?.fullName ?? "", conversationId: call.conversationId }, link: `/owner/messages?c=${call.conversationId}`, priority: "HIGH" });
  }
  return { status, durationSec };
}

/** Start a live voice call: both must be allowed to talk, and neither may already be on another call. */
export async function startCall(actor: Actor, conversationId: string) {
  rateLimit(`call:${actor.id}`, 10, 60_000);
  const conv = await loadConversation(actor, conversationId);
  if (conv.type === "SUPPORT") throw new AppError("INVALID_STATE", { reason: "not_for_support" });
  const others = await assertCanTalk(actor, conv);
  const other = others[0];
  if (!other || !conv.participants.some((p) => p.userId === actor.id)) throw new AppError("NOT_FOUND");

  await sweep([actor.id, other.userId]);
  const busy = await db.call.count({ where: { status: { in: [...LIVE] }, OR: [{ callerId: { in: [actor.id, other.userId] } }, { calleeId: { in: [actor.id, other.userId] } }] } });
  if (busy > 0) throw new AppError("INVALID_STATE", { reason: "busy" });

  const call = await db.call.create({ data: { conversationId, callerId: actor.id, calleeId: other.userId, kind: "AUDIO" } });
  const me = await db.user.findUnique({ where: { id: actor.id }, select: { fullName: true, avatarKey: true } });
  const avatar = await avatarUrls([me?.avatarKey ?? null]);
  const reachable = isConnected(other.userId);
  if (reachable) publish([other.userId], { type: "call:incoming", data: { callId: call.id, conversationId, caller: { id: actor.id, fullName: me?.fullName ?? actor.fullName, avatarUrl: avatar(me?.avatarKey ?? null) } } });
  else await finish(call.id, "MISSED"); // nobody has the app open: recorded as a missed call and notified
  return { id: call.id, reachable };
}

export async function actOnLiveCall(actor: Actor, id: string, action: CallLiveAction) {
  const call = await db.call.findUnique({ where: { id } });
  if (!call || (call.callerId !== actor.id && call.calleeId !== actor.id)) throw new AppError("NOT_FOUND");
  const isCaller = call.callerId === actor.id;

  if (action === "accept") {
    if (isCaller) throw new AppError("FORBIDDEN");
    const r = await db.call.updateMany({ where: { id, status: "RINGING" }, data: { status: "ACCEPTED", startedAt: new Date() } });
    if (r.count === 0) throw new AppError("INVALID_STATE", { from: call.status, action });
    publish([call.callerId], { type: "call:accepted", data: { callId: id } });
    return { status: "ACCEPTED" };
  }
  if (action === "reject") {
    if (isCaller) throw new AppError("FORBIDDEN");
    return (await finish(id, "REJECTED")) ?? { status: call.status };
  }
  if (action === "missed") {
    if (!isCaller) throw new AppError("FORBIDDEN");
    return (await finish(id, call.status === "RINGING" ? "MISSED" : "ENDED")) ?? { status: call.status };
  }
  return (await finish(id, call.status === "RINGING" ? (isCaller ? "MISSED" : "REJECTED") : "ENDED")) ?? { status: call.status };
}

/** Hand a WebRTC offer / answer / network candidate to the other person. Nothing is stored. */
export async function relaySignal(actor: Actor, id: string, input: z.infer<typeof callSignalSchema>) {
  rateLimit(`signal:${actor.id}`, 300, 60_000);
  if (JSON.stringify(input.data).length > 20_000) throw new AppError("VALIDATION_ERROR", [{ path: "data", code: "too_large" }]);
  const call = await db.call.findUnique({ where: { id } });
  if (!call || (call.callerId !== actor.id && call.calleeId !== actor.id)) throw new AppError("NOT_FOUND");
  if (call.status !== "RINGING" && call.status !== "ACCEPTED") throw new AppError("INVALID_STATE", { from: call.status });
  publish([call.callerId === actor.id ? call.calleeId : call.callerId], { type: "call:signal", data: { callId: id, ...input.data } });
  return { sent: true };
}
