import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/require-actor";
import { isOnline } from "./access";

const lastBeat = new Map<string, number>();

/** Client pings every ~30 s. Writes are throttled to one per 20 s per user. Socket presence replaces this later. */
export async function heartbeat(actor: Actor) {
  const now = Date.now();
  if (now - (lastBeat.get(actor.id) ?? 0) >= 20_000) {
    lastBeat.set(actor.id, now);
    await db.user.update({ where: { id: actor.id }, data: { lastSeenAt: new Date(now) } });
  }
  return { ok: true };
}

/** ● Online / ● Offline, only for people the caller shares a conversation with (Super Admin: anyone). */
export async function presenceOf(actor: Actor, userIds: string[]) {
  const visible =
    actor.role === "SUPER_ADMIN"
      ? userIds
      : (await db.conversationParticipant.findMany({
          where: { userId: { in: userIds }, conversation: { participants: { some: { userId: actor.id } } } },
          select: { userId: true },
        })).map((p) => p.userId);
  const users = await db.user.findMany({ where: { id: { in: [...new Set(visible)] } }, select: { id: true, lastSeenAt: true } });
  return users.map((u) => ({ userId: u.id, online: isOnline(u.lastSeenAt), lastSeenAt: u.lastSeenAt }));
}
