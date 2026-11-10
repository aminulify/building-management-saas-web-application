import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, pageQuery } from "@/lib/api/common";

/** Tabs of the Notification Center. "Payment" = rent receipts, confirmations and overdue alerts; "Maintenance" = repairs, progress and emergencies. */
export const CATEGORY_PREFIXES = { payment: ["rent.", "payment."], maintenance: ["maintenance.", "sos."] } as const;
export type Category = keyof typeof CATEGORY_PREFIXES;

export const notificationsQuery = pageQuery.extend({ category: z.enum(["payment", "maintenance"]).optional() });

export const categoryOf = (type: string): Category | "other" =>
  (Object.entries(CATEGORY_PREFIXES).find(([, p]) => p.some((x) => type.startsWith(x)))?.[0] as Category | undefined) ?? "other";

const inCategory = (c: Category): Prisma.NotificationWhereInput => ({ OR: CATEGORY_PREFIXES[c].map((startsWith) => ({ type: { startsWith } })) });

export async function listNotifications(actor: Actor, q: z.infer<typeof notificationsQuery>) {
  const mine = { userId: actor.id, archivedAt: null };
  const [rows, unread, unreadPayment, unreadMaintenance] = await Promise.all([
    db.notification.findMany({ where: { ...mine, ...(q.category ? inCategory(q.category) : {}) }, ...pageArgs(q) }),
    db.notification.count({ where: { ...mine, readAt: null } }),
    db.notification.count({ where: { ...mine, readAt: null, ...inCategory("payment") } }),
    db.notification.count({ where: { ...mine, readAt: null, ...inCategory("maintenance") } }),
  ]);
  const page = pageResult(rows, q.limit);
  return { ...page, items: page.items.map((n) => ({ ...n, category: categoryOf(n.type) })), unread, unreadByCategory: { payment: unreadPayment, maintenance: unreadMaintenance } };
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
