import type { Actor } from "@/lib/auth/require-actor";
import { listConversations } from "./service";

/** For the red alert on the Message button: how many messages wait for this person and when the newest one came. */
export async function unreadSummary(actor: Actor) {
  const convs = await listConversations(actor);
  const waiting = convs.filter((c) => c.unread > 0);
  const latest = waiting.reduce<Date | null>((m, c) => (c.lastMessage && (!m || c.lastMessage.createdAt > m) ? c.lastMessage.createdAt : m), null);
  return { count: waiting.reduce((a, c) => a + c.unread, 0), chats: waiting.length, latestAt: latest };
}
