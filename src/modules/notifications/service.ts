import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";

export async function listNotifications(actor: Actor, page: z.infer<typeof pageQuery>) {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: actor.id, archivedAt: null }, ...pageArgs(page) }),
    db.notification.count({ where: { userId: actor.id, readAt: null, archivedAt: null } }),
  ]);
  return { ...pageResult(rows, page.limit), unread };
}

export async function markRead(actor: Actor, id: string) {
  const r = await db.notification.updateMany({ where: { id, userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  if (r.count === 0 && !(await db.notification.count({ where: { id, userId: actor.id } }))) throw new AppError("NOT_FOUND");
  return { read: true };
}

export async function markAllRead(actor: Actor) {
  const r = await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: r.count };
}

export async function archive(actor: Actor, id: string) {
  const r = await db.notification.updateMany({ where: { id, userId: actor.id }, data: { archivedAt: new Date() } });
  if (r.count === 0) throw new AppError("NOT_FOUND");
  return { archived: true };
}
