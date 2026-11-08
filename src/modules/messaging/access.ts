import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/require-actor";
import { canCommunicate, type CommContext } from "@/shared/can-communicate";

export const ONLINE_WINDOW_MS = 60_000;
export const isOnline = (lastSeenAt: Date | null) => !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;

export async function hasActiveAgreement(a: string, b: string) {
  const n = await db.rentalAgreement.count({
    where: { status: "ACTIVE", OR: [{ ownerId: a, tenantId: b }, { ownerId: b, tenantId: a }] },
  });
  return n > 0;
}

/** DB-resolved context for the pure `canCommunicate` rule (architecture 4.3). */
export async function checkCommunicate(
  sender: { id: string; role: Role },
  recipient: { id: string; role: Role },
  extra: CommContext = {},
) {
  const needsAgreement = (sender.role === "OWNER" && recipient.role === "TENANT") || (sender.role === "TENANT" && recipient.role === "OWNER");
  const ctx: CommContext = { ...extra, hasActiveAgreement: needsAgreement ? await hasActiveAgreement(sender.id, recipient.id) : false };
  return canCommunicate(sender, recipient, ctx);
}

/** Participant, or any Super Admin for SUPPORT conversations (the support team shares one inbox). */
export async function loadConversation(actor: Actor, id: string) {
  const c = await db.conversation.findUnique({ where: { id }, include: { participants: true } });
  if (!c) throw new AppError("NOT_FOUND");
  const isParticipant = c.participants.some((p) => p.userId === actor.id);
  if (!isParticipant && !(actor.role === "SUPER_ADMIN" && c.type === "SUPPORT")) throw new AppError("NOT_FOUND"); // hide existence
  return c;
}
