import type { NotificationPriority, Prisma } from "@prisma/client";
import { db } from "./db";

interface NotifyInput {
  type: string;
  /** i18n key, resolved on the client (messages/*.json). */
  titleKey: string;
  params?: Prisma.InputJsonValue;
  link?: string;
  priority?: NotificationPriority;
}

/** In-app notifications. Email/SMS/push fan-out is picked up later from OutboxEvent (module: notifications). */
export async function notify(userIds: string[], n: NotifyInput, tx: Prisma.TransactionClient = db) {
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({
      userId,
      type: n.type,
      titleKey: n.titleKey,
      params: n.params ?? {},
      link: n.link,
      priority: n.priority ?? "NORMAL",
    })),
  });
}

export const activeUserIds = async (role: "GOV_ADMIN" | "SUPER_ADMIN", tx: Prisma.TransactionClient = db) =>
  (await tx.user.findMany({ where: { role, status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
