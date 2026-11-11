import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { activeUserIds, notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { keyBelongsTo, keyPurpose, signStorageKeys } from "@/modules/uploads/service";
import { checkCommunicate, isOnline, loadConversation } from "./access";
import { publish } from "./hub";
import { serializeMessages } from "./serialize";
import { baseOf } from "@/shared/areas";
import type { openConversationSchema, sendMessageSchema } from "./schema";

/** Where a person opens the chat: owners and tenants have their own Message page. */
/** The Message page of the person the notification is for: /home-owner, /tenant or /tenant-free follows their role. */
export const messagesLink = (role: string, conversationId: string) => `${baseOf(role) ?? "/home-owner"}/messages?c=${conversationId}`;

const userCard = { id: true, fullName: true, username: true, role: true, lastSeenAt: true, avatarKey: true } as const;

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

const previewKind = (atts: unknown): "text" | "voice" | "call" => {
  const a = (Array.isArray(atts) ? atts : []) as { kind?: string }[];
  return a.some((x) => x.kind === "voice") ? "voice" : a.some((x) => x.kind === "call") ? "call" : "text";
};

/** Unit and property of the active agreement between the caller and each other person (owner ↔ tenant), keyed by the other person's id. */
export async function agreementContext(actor: { id: string; role: string }, otherIds: string[]) {
  const out = new Map<string, { unit: string; property: string }>();
  if ((actor.role !== "OWNER" && actor.role !== "TENANT") || otherIds.length === 0) return out;
  const owner = actor.role === "OWNER";
  const rows = await db.rentalAgreement.findMany({
    where: owner ? { status: "ACTIVE", ownerId: actor.id, tenantId: { in: otherIds } } : { status: "ACTIVE", tenantId: actor.id, ownerId: { in: otherIds } },
    select: { ownerId: true, tenantId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  for (const r of rows) {
    const id = owner ? r.tenantId : r.ownerId;
    if (!out.has(id)) out.set(id, { unit: r.unit.unitNumber, property: r.unit.property.name });
  }
  return out;
}

/** Picture links for a set of avatar keys in one storage request. */
export async function avatarUrls(keys: (string | null)[]) {
  const urls = await signStorageKeys(keys.filter((k): k is string => !!k), 3600).catch(() => new Map<string, string>());
  return (k: string | null) => (k ? urls.get(k) ?? null : null);
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
  const [ctx, avatar] = await Promise.all([agreementContext(actor, userIds.filter((id) => id !== actor.id)), avatarUrls([...users.values()].map((u) => u.avatarKey))]);

  return Promise.all(
    convs.map(async (c) => {
      const me = c.participants.find((p) => p.userId === actor.id);
      const visible = { conversationId: c.id, NOT: { deletedForIds: { has: actor.id } } };
      const [last, unread] = await Promise.all([
        db.message.findFirst({ where: visible, orderBy: { id: "desc" }, select: { id: true, body: true, senderId: true, createdAt: true, attachments: true } }),
        db.message.count({ where: { ...visible, senderId: { not: actor.id }, ...(me?.lastReadMessageId ? { id: { gt: me.lastReadMessageId } } : {}) } }),
      ]);
      return {
        id: c.id, type: c.type, listingId: c.listingId, pinned: me?.pinned ?? c.type === "SUPPORT", unread,
        lastMessage: last ? { id: last.id, body: last.body, senderId: last.senderId, createdAt: last.createdAt, kind: previewKind(last.attachments) } : null,
        participants: c.participants.filter((p) => p.userId !== actor.id).map((p) => {
          const u = users.get(p.userId);
          return u ? { id: u.id, fullName: u.fullName, username: u.username, role: u.role, avatarUrl: avatar(u.avatarKey), online: isOnline(u.lastSeenAt), lastSeenAt: u.lastSeenAt, unit: ctx.get(u.id)?.unit ?? null, property: ctx.get(u.id)?.property ?? null } : null;
        }).filter(Boolean),
      };
    }),
  );
}

export async function listMessages(actor: Actor, conversationId: string, before?: string, q?: string) {
  const conv = await loadConversation(actor, conversationId);
  const rows = await db.message.findMany({
    where: { conversationId, ...(before ? { id: { lt: before } } : {}), ...(q ? { body: { contains: q, mode: "insensitive" } } : {}), NOT: { deletedForIds: { has: actor.id } } },
    orderBy: { id: "desc" }, take: 30,
  });
  const readUpTo = conv.participants.filter((p) => p.userId !== actor.id).map((p) => p.lastReadMessageId).filter((x): x is string => !!x).sort().at(-1) ?? null;
  return { items: await serializeMessages(rows.reverse()), nextBefore: rows.length === 30 ? rows[0]!.id : null, readUpTo };
}

/** "May these two talk": used by sending a message and by starting a call. Returns the other participants. */
export async function assertCanTalk(actor: Actor, conv: Awaited<ReturnType<typeof loadConversation>>) {
  const others = conv.participants.filter((p) => p.userId !== actor.id);
  if (conv.type === "DIRECT" || conv.type === "INSPECTION") {
    const other = await db.user.findFirst({ where: { id: others[0]?.userId, status: "ACTIVE" }, select: { id: true, role: true } });
    if (!other) throw new AppError("FORBIDDEN", { reason: "recipient_unavailable" });
    const adminOpened = (other.role === "SUPER_ADMIN" || other.role === "GOV_ADMIN") && (await db.message.count({ where: { conversationId: conv.id, senderId: other.id } })) > 0;
    if (!(await checkCommunicate(actor, other, { isReplyToAdmin: adminOpened }))) throw new AppError("FORBIDDEN", { reason: "cannot_communicate" });
  } else if (conv.type === "SUPPORT" && actor.role !== "SUPER_ADMIN" && !conv.participants.some((p) => p.userId === actor.id)) {
    throw new AppError("NOT_FOUND");
  }
  return others;
}

export async function sendMessage(actor: Actor, conversationId: string, input: z.infer<typeof sendMessageSchema>) {
  rateLimit(`msg:${actor.id}`, 20, 10_000);
  const conv = await loadConversation(actor, conversationId);
  const others = await assertCanTalk(actor, conv);
  for (const att of input.attachments) {
    if ("kind" in att && att.kind === "voice" && (!keyBelongsTo(att.key, actor.id) || keyPurpose(att.key) !== "VOICE_MESSAGE")) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
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
      const roles = await tx.user.findMany({ where: { id: { in: recipients } }, select: { id: true, role: true } });
      for (const group of ["TENANT", "OTHER"] as const) {
        const ids = roles.filter((r) => (group === "TENANT") === (r.role === "TENANT")).map((r) => r.id);
        await notify(ids, { type: "message.new", titleKey: "notifications.messageNew", params: { from: actor.fullName, conversationId }, link: messagesLink(group === "TENANT" ? "TENANT" : "OWNER", conversationId) }, tx);
      }
      return m;
    });
    const [out] = await serializeMessages([msg]);
    const audience = [actor.id, ...others.map((o) => o.userId), ...(conv.type === "SUPPORT" ? await activeUserIds("SUPER_ADMIN") : [])];
    publish(audience, { type: "message:new", data: { conversationId, message: out } });
    return out!;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // retry of the same clientId → return the stored message (idempotent)
      const stored = await db.message.findUniqueOrThrow({ where: { senderId_clientId: { senderId: actor.id, clientId: input.clientId } } });
      return (await serializeMessages([stored]))[0]!;
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
  publish(conv.participants.map((p) => p.userId), { type: "message:read", data: { conversationId, userId: actor.id, lastReadMessageId: last.id } });
  return { read: true, lastReadMessageId: last.id };
}

export async function archiveConversation(actor: Actor, conversationId: string) {
  await loadConversation(actor, conversationId);
  await db.conversationParticipant.updateMany({ where: { conversationId, userId: actor.id }, data: { archivedAt: new Date() } });
  return { archived: true };
}
