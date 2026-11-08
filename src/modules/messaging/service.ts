import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { activeUserIds, notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { checkCommunicate, isOnline, loadConversation } from "./access";
import type { openConversationSchema, sendMessageSchema } from "./schema";

const userCard = { id: true, fullName: true, username: true, role: true, lastSeenAt: true } as const;

/** Find-or-create between exactly two users (shared with marketplace inquiries). */
export async function findOrCreatePair(type: "DIRECT" | "INSPECTION" | "LISTING_INQUIRY", a: string, b: string, listingId?: string) {
  const existing = await db.conversation.findFirst({
    where: { type, listingId: listingId ?? null, AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
  });
  if (existing) return existing;
  return db.conversation.create({ data: { type, listingId, participants: { create: [{ userId: a }, { userId: b }] } } });
}

export async function openConversation(actor: Actor, input: z.infer<typeof openConversationSchema>) {
  if (input.type === "SUPPORT") {
    if (actor.role === "SUPER_ADMIN") throw new AppError("FORBIDDEN", { reason: "admins_use_direct" });
    const existing = await db.conversation.findFirst({ where: { type: "SUPPORT", participants: { some: { userId: actor.id } } } });
    return existing ?? db.conversation.create({ data: { type: "SUPPORT", participants: { create: [{ userId: actor.id, pinned: true }] } } });
  }

  const recipient = await db.user.findFirst({ where: { id: input.recipientId, status: "ACTIVE" }, select: { id: true, role: true } });
  if (!recipient) throw new AppError("NOT_FOUND");
  if (input.type === "INSPECTION" && actor.role !== "GOV_ADMIN") throw new AppError("FORBIDDEN", { reason: "inspection_gov_only" });
  if (!(await checkCommunicate(actor, recipient))) throw new AppError("FORBIDDEN", { reason: "cannot_communicate" });
  return findOrCreatePair(input.type, actor.id, recipient.id);
}

export async function listConversations(actor: Actor) {
  const where: Prisma.ConversationWhereInput =
    actor.role === "SUPER_ADMIN"
      ? { OR: [{ type: "SUPPORT" }, { participants: { some: { userId: actor.id, archivedAt: null } } }] }
      : { participants: { some: { userId: actor.id, archivedAt: null } } };
  const convs = await db.conversation.findMany({
    where, orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], take: 50,
    include: { participants: true },
  });

  const userIds = [...new Set(convs.flatMap((c) => c.participants.map((p) => p.userId)))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: userCard })).map((u) => [u.id, u]));

  return Promise.all(
    convs.map(async (c) => {
      const me = c.participants.find((p) => p.userId === actor.id);
      const [last, unread] = await Promise.all([
        db.message.findFirst({ where: { conversationId: c.id }, orderBy: { id: "desc" }, select: { id: true, body: true, senderId: true, createdAt: true } }),
        db.message.count({ where: { conversationId: c.id, senderId: { not: actor.id }, ...(me?.lastReadMessageId ? { id: { gt: me.lastReadMessageId } } : {}) } }),
      ]);
      return {
        id: c.id, type: c.type, listingId: c.listingId, pinned: me?.pinned ?? c.type === "SUPPORT", lastMessage: last, unread,
        participants: c.participants.filter((p) => p.userId !== actor.id).map((p) => {
          const u = users.get(p.userId);
          return u ? { id: u.id, fullName: u.fullName, role: u.role, online: isOnline(u.lastSeenAt), lastSeenAt: u.lastSeenAt } : null;
        }).filter(Boolean),
      };
    }),
  );
}

export async function listMessages(actor: Actor, conversationId: string, before?: string, q?: string) {
  await loadConversation(actor, conversationId);
  const rows = await db.message.findMany({
    where: { conversationId, ...(before ? { id: { lt: before } } : {}), ...(q ? { body: { contains: q, mode: "insensitive" } } : {}), NOT: { deletedForIds: { has: actor.id } } },
    orderBy: { id: "desc" }, take: 30,
  });
  return { items: rows.reverse(), nextBefore: rows.length === 30 ? rows[0]!.id : null };
}

export async function sendMessage(actor: Actor, conversationId: string, input: z.infer<typeof sendMessageSchema>) {
  rateLimit(`msg:${actor.id}`, 20, 10_000);
  const conv = await loadConversation(actor, conversationId);
  const others = conv.participants.filter((p) => p.userId !== actor.id);

  if (conv.type === "DIRECT" || conv.type === "INSPECTION") {
    const other = await db.user.findFirst({ where: { id: others[0]?.userId, status: "ACTIVE" }, select: { id: true, role: true } });
    if (!other) throw new AppError("FORBIDDEN", { reason: "recipient_unavailable" });
    const adminOpened = (other.role === "SUPER_ADMIN" || other.role === "GOV_ADMIN") && (await db.message.count({ where: { conversationId, senderId: other.id } })) > 0;
    if (!(await checkCommunicate(actor, other, { isReplyToAdmin: adminOpened }))) throw new AppError("FORBIDDEN", { reason: "cannot_communicate" });
  } else if (conv.type === "SUPPORT" && actor.role !== "SUPER_ADMIN" && !conv.participants.some((p) => p.userId === actor.id)) {
    throw new AppError("NOT_FOUND");
  }

  try {
    const msg = await db.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId, senderId: actor.id, clientId: input.clientId, body: input.body, attachments: input.attachments } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
      // super admin answering support joins the thread so the user sees a named sender
      if (actor.role === "SUPER_ADMIN" && !conv.participants.some((p) => p.userId === actor.id)) {
        await tx.conversationParticipant.create({ data: { conversationId, userId: actor.id } });
      }
      await tx.conversationParticipant.updateMany({ where: { conversationId, userId: actor.id }, data: { lastReadMessageId: m.id } });
      const recipients = conv.type === "SUPPORT" && actor.role !== "SUPER_ADMIN" ? await activeUserIds("SUPER_ADMIN", tx) : others.map((o) => o.userId);
      await notify(recipients, { type: "message.new", titleKey: "notifications.messageNew", params: { from: actor.fullName }, link: `/messages/${conversationId}` }, tx);
      return m;
    });
    return msg;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // retry of the same clientId → return the stored message (idempotent)
      return db.message.findUniqueOrThrow({ where: { senderId_clientId: { senderId: actor.id, clientId: input.clientId } } });
    }
    throw e;
  }
}

export async function markRead(actor: Actor, conversationId: string) {
  const conv = await loadConversation(actor, conversationId);
  const last = await db.message.findFirst({ where: { conversationId }, orderBy: { id: "desc" }, select: { id: true } });
  if (!last) return { read: true };
  if (conv.participants.some((p) => p.userId === actor.id)) {
    await db.conversationParticipant.updateMany({ where: { conversationId, userId: actor.id }, data: { lastReadMessageId: last.id } });
  }
  return { read: true, lastReadMessageId: last.id };
}

export async function archiveConversation(actor: Actor, conversationId: string) {
  await loadConversation(actor, conversationId);
  await db.conversationParticipant.updateMany({ where: { conversationId, userId: actor.id }, data: { archivedAt: new Date() } });
  return { archived: true };
}
