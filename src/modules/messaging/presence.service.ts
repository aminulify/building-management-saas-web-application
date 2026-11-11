import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/require-actor";
import { isOnline, ONLINE_WINDOW_MS } from "./access";
import { isConnected, publish } from "./hub";

const lastBeat = new Map<string, number>();

/** Client pings every ~30 s. Writes are throttled to one per 20 s per user. An open event stream pings for itself. */
export async function heartbeat(actor: Actor) {
  const now = Date.now();
  if (now - (lastBeat.get(actor.id) ?? 0) >= 20_000) {
    lastBeat.set(actor.id, now);
    await db.user.update({ where: { id: actor.id }, data: { lastSeenAt: new Date(now) } });
  }
  return { ok: true };
}

/** Everyone who shares a conversation with this user: the people who should see the green dot change. */
async function peersOf(userId: string) {
  const rows = await db.conversationParticipant.findMany({
    where: { userId: { not: userId }, conversation: { participants: { some: { userId } } } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** An event stream opened: online now, and the people they chat with see it at once. */
export async function goOnline(actor: Actor) {
  lastBeat.set(actor.id, Date.now());
  const now = new Date();
  await db.user.update({ where: { id: actor.id }, data: { lastSeenAt: now } });
  publish(await peersOf(actor.id), { type: "presence:update", data: { userId: actor.id, online: true, lastSeenAt: now } });
}

/** The last event stream closed: offline at once (not after the one-minute window), unless another tab is still open. */
export async function goOffline(actor: Actor) {
  if (isConnected(actor.id)) return;
  const seen = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
  lastBeat.delete(actor.id);
  await db.user.update({ where: { id: actor.id }, data: { lastSeenAt: seen } });
  publish(await peersOf(actor.id), { type: "presence:update", data: { userId: actor.id, online: false, lastSeenAt: seen } });
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
