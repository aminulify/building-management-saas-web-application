import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { addressText, documentViews, DOC_KINDS, reviewUserDocument, type DocKindName, type documentReviewSchema } from "@/modules/admin/shared/document-review";
import { isDiscoverable, profileGaps } from "@/modules/users/discoverable";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";

/**
 * Super Admin → Tenant Free: people who signed up and are neither an owner nor a tenant with a running lease yet
 * (account type "Tenant-Free" = GENERAL_USER). They become a Tenant when an owner moves them into a unit.
 */

export const PAGE_SIZE = 10;
const DAY = 86_400_000;

/** Not archived, not deleted: an account that can still be Active or Suspended. */
const base = (): Prisma.UserWhereInput => ({ role: "GENERAL_USER", archivedAt: null, status: { in: ["ACTIVE", "SUSPENDED"] } });
export type FreeState = "ACTIVE" | "SUSPENDED";

export async function freeStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const [total, fresh, verified, pending] = await Promise.all([
    db.user.count({ where: base() }),
    db.user.count({ where: { ...base(), createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    db.user.count({ where: { ...base(), verificationStatus: "VERIFIED" } }),
    db.user.count({ where: { ...base(), verificationStatus: "PENDING" } }),
  ]);
  return { total, newLast30: fresh, verified, verifiedRate: total === 0 ? 0 : Math.round((verified / total) * 1000) / 10, pending };
}

export const freeListQuery = z.object({
  tab: z.enum(["all", "VERIFIED", "PENDING", "UNVERIFIED", "REJECTED"]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

export async function freeList(actor: Actor, q: z.infer<typeof freeListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const and: Prisma.UserWhereInput[] = [base()];
  if (q.tab !== "all") and.push({ verificationStatus: q.tab });
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    and.push({ OR: [{ fullName: has(q.q) }, { username: has(q.q) }, { email: has(q.q) }, { phone: { contains: q.q } }, { tenantCode: has(q.q) }] });
  }
  const where: Prisma.UserWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, orderBy: { id: "desc" }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, fullName: true, username: true, tenantCode: true, email: true, phone: true, occupation: true, status: true, verificationStatus: true, createdAt: true, avatarKey: true,
        nid: true, dateOfBirth: true, addressId: true, address: { select: { upazila: true, district: true } },
      },
    }),
    db.user.count({ where }),
  ]);
  const avatars = await signStorageKeys(rows.flatMap((r) => (r.avatarKey ? [r.avatarKey] : [])), 3600);
  const items = rows.map(({ avatarKey, address, status, nid, dateOfBirth, addressId, ...u }) => ({
    ...u, state: status as FreeState, avatarUrl: avatarKey ? avatars.get(avatarKey) ?? null : null,
    location: [address?.upazila, address?.district].filter(Boolean).join(", "),
    /** owners can find this person (profile complete and NID verified) */
    visibleToOwners: isDiscoverable({ ...u, nid, dateOfBirth, addressId }),
  }));
  return { items, total, page: q.page, pageSize: PAGE_SIZE };
}

export async function freeDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({
    where: { id, ...base() },
    select: {
      id: true, fullName: true, username: true, tenantCode: true, email: true, phone: true, occupation: true, gender: true, dateOfBirth: true, nid: true, nidLast4: true,
      status: true, verificationStatus: true, createdAt: true, lastSeenAt: true, avatarKey: true, addressId: true,
      address: { select: { division: true, district: true, upazila: true, union: true, street: true, postOffice: true } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND");
  const [docs, log] = await Promise.all([
    db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: id, kind: { in: [...DOC_KINDS] } }, orderBy: { id: "desc" }, select: { id: true, kind: true, status: true, notes: true, storageKey: true, createdAt: true } }),
    db.accountStatusLog.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 50, select: { id: true, action: true, comment: true, adminUsername: true, createdAt: true } }),
  ]);
  const [documents, avatarUrl] = await Promise.all([
    documentViews(docs, null),
    u.avatarKey ? signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null),
  ]);
  const { avatarKey, address, status, addressId, ...rest } = u;
  return {
    ...rest, avatarUrl, state: status as FreeState, address: addressText(address), documents, log,
    visibleToOwners: isDiscoverable({ ...u }),
    gaps: profileGaps({ ...u }),
  };
}

/** Account status: Active or Suspended (a suspended person cannot sign in). A reason is required to suspend and is kept in the permanent log. */
export const freeStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  comment: z.string().trim().min(3).max(500).optional(),
}).strict().superRefine((v, ctx) => { if (v.status === "SUSPENDED" && !v.comment) ctx.addIssue({ code: "custom", path: ["comment"], message: "comment_required" }); });

export async function setFreeStatus(actor: Actor, id: string, input: z.infer<typeof freeStatusSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const u = await tx.user.findFirst({ where: { id, ...base() }, select: { status: true } });
    if (!u) throw new AppError("NOT_FOUND");
    if (u.status === input.status && !input.comment) return { id, state: u.status as FreeState, changed: false as const };
    const comment = input.comment ?? null;
    await tx.user.update({ where: { id }, data: { status: input.status } });
    await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: input.status, comment } });
    await notify([id], input.status === "SUSPENDED"
      ? { type: "account.suspended", titleKey: "notifications.accountSuspended", params: { reason: comment ?? "" }, link: "/tenant-free/profile", priority: "HIGH" }
      : { type: "account.active", titleKey: "notifications.accountRestored", params: {}, link: "/tenant-free/profile" }, tx);
    await writeAudit({ actor, action: `tenant_free.${input.status.toLowerCase()}`, resourceType: "User", resourceId: id, before: { status: u.status }, after: { status: input.status, comment }, req }, tx);
    return { id, state: input.status as FreeState, changed: true as const };
  });
}

/** Verify or reject one NID photo of a Tenant-Free account (same rules as tenants and owners: a verified photo is locked, the person is told). */
export async function reviewFreeDocument(actor: Actor, id: string, kind: DocKindName, input: z.infer<typeof documentReviewSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({ where: { id, ...base() }, select: { id: true } });
  if (!u) throw new AppError("NOT_FOUND");
  return { id, ...(await reviewUserDocument(actor, id, kind, input, req, "/tenant-free/profile")) };
}
