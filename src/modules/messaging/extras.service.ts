import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/require-actor";
import { loadConversation } from "./access";

/** "Delete for Self": hides one message from the caller only. The row (and the other side's copy) stays. */
export async function deleteForSelf(actor: Actor, conversationId: string, messageId: string) {
  await loadConversation(actor, conversationId);
  const m = await db.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true, deletedForIds: true } });
  if (!m) throw new AppError("NOT_FOUND");
  if (!m.deletedForIds.includes(actor.id)) await db.message.update({ where: { id: m.id }, data: { deletedForIds: { push: actor.id } } });
  return { deleted: true };
}
