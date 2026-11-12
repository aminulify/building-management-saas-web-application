import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { notify } from "../notify";
import { profileGaps } from "../../modules/users/discoverable";

/**
 * An owner may add properties, add units and post flats for sale only when ALL of these are true:
 * the plan is active, the plan payment was approved by the Super Admin, and the profile is filled in with the NID verified.
 */
export type Gap = "plan" | "payment" | "profile" | "nid";

const NOTICE: Record<Gap, { type: string; key: string; link: string }> = {
  plan: { type: "access.plan", key: "notifications.accessPlan", link: "/home-owner/subscription" },
  payment: { type: "access.payment", key: "notifications.accessPayment", link: "/home-owner/subscription" },
  profile: { type: "access.profile", key: "notifications.accessProfile", link: "/home-owner/profile" },
  nid: { type: "access.nid", key: "notifications.accessNid", link: "/home-owner/profile" },
};
export const GAP_ORDER: Gap[] = ["profile", "nid", "plan", "payment"];

type Client = Prisma.TransactionClient | typeof db;

/** What is still missing for this owner (empty list = everything unlocked). */
export async function ownerGaps(userId: string, tx: Client = db): Promise<Gap[]> {
  const [u, sub] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { verificationStatus: true, fullName: true, phone: true, email: true, nid: true, dateOfBirth: true, occupation: true, addressId: true } }),
    tx.userSubscription.findFirst({ where: { userId, audience: "OWNER", status: { in: ["ACTIVE", "GRACE"] } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  const gaps: Gap[] = [];
  if (profileGaps(u).length > 0) gaps.push("profile");
  if (u?.verificationStatus !== "VERIFIED") gaps.push("nid");
  if (!sub) gaps.push("plan");
  else if ((await tx.paymentTransaction.count({ where: { subscriptionId: sub.id, status: "SUCCESS" } })) === 0) gaps.push("payment");
  return gaps;
}

/**
 * The owner tried something that is still locked: put one notice per missing step in the notification center.
 * A notice stays until the step is done (it comes back as unread if the owner tries again), and there is never a duplicate.
 * Written outside the caller's transaction on purpose: the blocked action rolls its own transaction back.
 */
export async function raiseOwnerRestriction(userId: string, gaps: Gap[]) {
  for (const g of gaps) {
    const n = NOTICE[g];
    const open = await db.notification.findFirst({ where: { userId, type: n.type, archivedAt: null }, select: { id: true } });
    if (open) await db.notification.update({ where: { id: open.id }, data: { readAt: null } });
    else await notify([userId], { type: n.type, titleKey: n.key, params: {}, link: n.link, priority: "HIGH" });
  }
}

/** The step is done: its notice goes away. */
export async function resolveOwnerNotices(userId: string, gaps: Gap[] = GAP_ORDER, tx: Client = db) {
  const now = new Date();
  await tx.notification.updateMany({ where: { userId, type: { in: gaps.map((g) => NOTICE[g].type) }, archivedAt: null }, data: { archivedAt: now, readAt: now } });
}
