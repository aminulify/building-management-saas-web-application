import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { deleteProperty } from "../properties/service";
import { addressText } from "../shared/document-review";
import { OWNER_EXIT_REASONS, OWNER_EXIT_TEXT, type OwnerExitReason } from "./reasons";

/**
 * Super Admin → Previous Owners: every owner who is no longer active.
 *   ARCHIVED = removed from the active list (archivedAt set, cannot sign in)
 *   BANNED   = banned for violations
 *   INACTIVE = dormant account (never archived)
 *   DELETED  = removed for good (kept as a hidden record when history depends on it)
 * Reactivating moves the owner back to Active Property Owners.
 */
export const PAGE_SIZE = 10;
export const EXIT_STATES = ["ARCHIVED", "BANNED", "INACTIVE", "DELETED"] as const;
export const SET_STATES = ["ACTIVE", ...EXIT_STATES] as const;
export type ExitState = (typeof EXIT_STATES)[number];

export const ownerExitState = (u: { status: string; archivedAt: Date | null }): ExitState =>
  u.status === "BANNED" ? "BANNED" : u.status === "DELETED" ? "DELETED" : u.archivedAt ? "ARCHIVED" : "INACTIVE";

export const archiveListQuery = z.object({
  status: z.enum(["all", ...EXIT_STATES]).default("all"),
  reason: z.enum(["all", ...OWNER_EXIT_REASONS]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

export const exitStateSchema = z
  .object({ status: z.enum(SET_STATES), reason: z.enum(OWNER_EXIT_REASONS).optional(), note: z.string().trim().max(300).optional() })
  .strict()
  .refine((v) => v.status === "ACTIVE" || !!v.reason, { path: ["reason"], message: "reason_required" });

const owners: Prisma.UserWhereInput = { role: "OWNER" };
const inArchive: Prisma.UserWhereInput = { ...owners, OR: [{ archivedAt: { not: null } }, { status: { in: ["BANNED", "INACTIVE", "DELETED"] } }] };

const STATE_WHERE: Record<ExitState, Prisma.UserWhereInput> = {
  BANNED: { status: "BANNED" },
  DELETED: { status: "DELETED" },
  ARCHIVED: { archivedAt: { not: null }, status: { notIn: ["BANNED", "DELETED"] } },
  INACTIVE: { status: "INACTIVE", archivedAt: null },
};

/** Status, reason (records saved before reasons existed count as "Other") and one search box over name, Owner ID, e-mail, phone and username. */
export function archiveWhere(q: { status: string; reason: string; q?: string }): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [inArchive];
  if (q.status !== "all") and.push(STATE_WHERE[q.status as ExitState]);
  if (q.reason === "OTHER") and.push({ OR: [{ archiveReasonCode: "OTHER" }, { archiveReasonCode: null }] });
  else if (q.reason !== "all") and.push({ archiveReasonCode: q.reason });
  const text = q.q?.trim();
  if (text) {
    const has = { contains: text, mode: "insensitive" as const };
    and.push({ OR: [{ fullName: has }, { username: has }, { email: has }, { ownerCode: has }, { phone: { contains: text } }] });
  }
  return { AND: and };
}

export async function archiveStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [archived, banned, inactive, deleted, reactivated] = await Promise.all([
    db.user.count({ where: { AND: [inArchive, STATE_WHERE.ARCHIVED] } }),
    db.user.count({ where: { AND: [inArchive, STATE_WHERE.BANNED] } }),
    db.user.count({ where: { AND: [inArchive, STATE_WHERE.INACTIVE] } }),
    db.user.count({ where: { AND: [inArchive, STATE_WHERE.DELETED] } }),
    db.auditLog.count({ where: { action: "owner.reactivate", resourceType: "User", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  return { archived, banned, inactive, deleted, total: archived + banned + inactive + deleted, reactivated };
}

const card = { id: true, fullName: true, username: true, ownerCode: true, email: true, phone: true, status: true, archivedAt: true, leftAt: true, updatedAt: true, archiveReason: true, archiveReasonCode: true, avatarKey: true } as const;

export async function archiveList(actor: Actor, q: z.infer<typeof archiveListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const where = archiveWhere(q);
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ leftAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: card }),
    db.user.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [props, avatars] = await Promise.all([
    ids.length ? db.property.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }) : [],
    signStorageKeys(rows.flatMap((r) => (r.avatarKey ? [r.avatarKey] : [])), 3600),
  ]);
  const items = rows.map(({ avatarKey, status, archivedAt, leftAt, updatedAt, archiveReasonCode, ...r }) => ({
    ...r, state: ownerExitState({ status, archivedAt }), reasonCode: (archiveReasonCode ?? "OTHER") as OwnerExitReason, leftAt: leftAt ?? archivedAt ?? updatedAt,
    avatarUrl: avatarKey ? avatars.get(avatarKey) ?? null : null, properties: props.find((p) => p.ownerId === r.id)?._count._all ?? 0,
  }));
  return { items, total, page: q.page, pageSize: PAGE_SIZE };
}

/** Everything the View / Edit / Delete windows show: profile, departure, ban log, and every property the owner ever managed. */
export async function archiveDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({
    where: { AND: [inArchive, { id }] },
    select: {
      ...card, gender: true, occupation: true, dateOfBirth: true, nidLast4: true, verificationStatus: true, createdAt: true, lastSeenAt: true,
      address: { select: { division: true, district: true, upazila: true, union: true, street: true, postOffice: true } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND");
  const [log, props, listings, paid, avatarUrl, lastPlan] = await Promise.all([
    db.accountStatusLog.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 100, select: { id: true, action: true, comment: true, adminUsername: true, createdAt: true } }),
    db.property.findMany({ where: { ownerId: id }, orderBy: { id: "desc" }, take: 100, select: { id: true, name: true, type: true, status: true, archiveReasonCode: true, archivedAt: true, declaredUnits: true, locationText: true, address: { select: { upazila: true, district: true } }, _count: { select: { units: true } } } }),
    db.listing.count({ where: { sellerId: id } }),
    db.paymentTransaction.aggregate({ where: { userId: id, status: "SUCCESS" }, _sum: { amount: true }, _count: { _all: true } }),
    u.avatarKey ? signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null),
    db.userSubscription.findFirst({ where: { userId: id, audience: "OWNER" }, orderBy: { createdAt: "desc" }, select: { status: true, endsAt: true, plan: { select: { nameEn: true, nameBn: true } } } }),
  ]);
  const { avatarKey, address, status, archivedAt, leftAt, updatedAt, archiveReasonCode, nidLast4, archiveReason, ...rest } = u;
  return {
    ...rest, avatarUrl, state: ownerExitState({ status, archivedAt }), reasonCode: (archiveReasonCode ?? "OTHER") as OwnerExitReason, reasonNote: archiveReason,
    leftAt: leftAt ?? archivedAt ?? updatedAt, address: addressText(address), nid: nidLast4 ? `•••••••••${nidLast4}` : null, log,
    listings, paid: { total: (paid._sum.amount ?? 0).toString(), count: paid._count._all },
    lastPlan: lastPlan ? { status: lastPlan.status, endsAt: lastPlan.endsAt, nameEn: lastPlan.plan.nameEn, nameBn: lastPlan.plan.nameBn } : null,
    properties: props.map((p) => ({
      id: p.id, name: p.name, type: p.type, status: p.status, archived: !!p.archivedAt, reasonCode: p.archiveReasonCode, units: Math.max(p.declaredUnits ?? 0, p._count.units),
      location: p.locationText || [p.address?.upazila, p.address?.district].filter(Boolean).join(", "),
    })),
  };
}

/** The owner's live properties and listings leave with the account (same rules as the Properties page: tenants are moved out and told). */
async function takeDown(actor: Actor, id: string, reasonCode: OwnerExitReason, text: string, req: Request, now: Date) {
  const propCode = ({ SOLD_ALL_PROPERTIES: "SOLD_PROPERTY", POLICY_VIOLATION_FRAUD: "POLICY_VIOLATION", NON_PAYMENT: "NON_PAYMENT", SUBSCRIPTION_CANCELLED: "NON_PAYMENT", OWNER_REQUEST: "OWNER_REQUEST", BUSINESS_CLOSED: "OWNER_REQUEST" } as const)[reasonCode as never] ?? "OTHER";
  const props = await db.property.findMany({ where: { ownerId: id, archivedAt: null }, select: { id: true } });
  for (const p of props) await deleteProperty(actor, p.id, req, { reasonCode: propCode as never, note: text.length >= 3 ? text : undefined });
  const taken = await db.listing.updateMany({ where: { sellerId: id, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: text, isFeatured: false, boostEndsAt: null } });
  return { properties: props.length, listings: taken.count };
}

/** Edit status & reactivate: Active brings the owner back to Active Property Owners (and tells them); the other states keep them out. */
export async function setExitState(actor: Actor, id: string, input: z.infer<typeof exitStateSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({ where: { AND: [inArchive, { id }] }, select: { id: true, status: true, archivedAt: true, leftAt: true, archiveReasonCode: true, fullName: true } });
  if (!u) throw new AppError("NOT_FOUND");
  const before = ownerExitState(u);
  const code = input.status === "ACTIVE" ? null : (input.reason ?? "OTHER");
  const changed = before !== input.status;
  if (!changed && (u.archiveReasonCode ?? "OTHER") === code && !input.note) return { id, state: before, changed: false as const };

  const now = new Date();
  const text = input.status === "ACTIVE" ? "" : input.note || OWNER_EXIT_TEXT[code as OwnerExitReason];
  const moved = input.status === "ACTIVE" ? { properties: 0, listings: 0 } : await takeDown(actor, id, code as OwnerExitReason, text, req, now);
  await db.$transaction(async (tx) => {
    if (input.status === "ACTIVE") {
      await tx.user.update({ where: { id }, data: { status: "ACTIVE", archivedAt: null, archiveReason: null, archiveReasonCode: null, leftAt: null, warnedAt: null } });
      await notify([id], { type: "account.active", titleKey: "notifications.accountRestored", params: {}, link: "/home-owner/dashboard" }, tx);
    } else {
      const data: Prisma.UserUpdateInput = { archiveReason: text, archiveReasonCode: code, leftAt: u.leftAt ?? now, warnedAt: null };
      if (input.status === "INACTIVE") Object.assign(data, { status: "INACTIVE", archivedAt: null });
      else Object.assign(data, { status: input.status === "BANNED" ? "BANNED" : input.status === "DELETED" ? "DELETED" : "INACTIVE", archivedAt: u.archivedAt ?? now });
      await tx.user.update({ where: { id }, data });
    }
    if (changed) await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: input.status, comment: input.status === "ACTIVE" ? input.note ?? null : text } });
    await writeAudit({ actor, action: input.status === "ACTIVE" ? "owner.reactivate" : "owner.status_change", resourceType: "User", resourceId: id, before: { state: before }, after: { state: input.status, reasonCode: code, ...moved }, req }, tx);
  });
  return { id, state: input.status, changed, ...moved };
}

/**
 * Delete from the archive. An owner nothing depends on is erased for good (and the sign-in account with them). One with history
 * (properties, plans, payments, chats) stays as a hidden "Deleted" record so the money and legal trail is never broken.
 */
export async function archiveDelete(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({ where: { AND: [inArchive, { id }] }, select: { id: true, authId: true, fullName: true, status: true, archivedAt: true, leftAt: true } });
  if (!u) throw new AppError("NOT_FOUND");
  try {
    await db.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.accountStatusLog.deleteMany({ where: { userId: id } });
      await tx.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: id } });
      await tx.ownerProfile.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      await writeAudit({ actor, action: "owner.purge", resourceType: "User", resourceId: id, before: { name: u.fullName }, after: { purged: true }, req }, tx);
    });
    if (u.authId) await supabaseAdmin().auth.admin.deleteUser(u.authId).catch(() => undefined);
    return { id, purged: true as const };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2003") throw e;
  }
  if (u.status !== "DELETED") {
    const now = new Date();
    const text = OWNER_EXIT_TEXT.ACCOUNT_DELETED_BY_USER;
    const moved = await takeDown(actor, id, "OTHER", "Account deleted", req, now);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: "DELETED", archivedAt: u.archivedAt ?? now, leftAt: u.leftAt ?? now, warnedAt: null } });
      await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: "DELETED", comment: text } });
      await writeAudit({ actor, action: "owner.delete", resourceType: "User", resourceId: id, before: { status: u.status }, after: { status: "DELETED", ...moved }, req }, tx);
    });
  }
  return { id, purged: false as const };
}
