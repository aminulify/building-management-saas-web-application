import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { signStorageKey } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { accountState, ownerStatusSchema } from "../owners/service";
import { addressText } from "../shared/document-review";

/**
 * Super Admin → Message → click a person's profile: one card for anyone the Super Admin can chat with
 * (owner, tenant, Tenant Free, Government). Same Active / Warning / Suspended switch and permanent log as the Active Owners page.
 */
export const personStatusSchema = ownerStatusSchema;
const KINDS = ["OWNER", "TENANT", "GENERAL_USER", "GOV_ADMIN"] as const;

const HOME: Record<(typeof KINDS)[number], string | undefined> = { OWNER: "/home-owner/dashboard", TENANT: "/tenant/dashboard", GENERAL_USER: "/tenant-free/profile", GOV_ADMIN: undefined };


export async function personProfile(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const u = await db.user.findFirst({
    where: { id, role: { in: [...KINDS] }, archivedAt: null },
    select: {
      id: true, role: true, fullName: true, username: true, ownerCode: true, tenantCode: true, email: true, phone: true, occupation: true, gender: true, dateOfBirth: true, nidLast4: true,
      status: true, warnedAt: true, verificationStatus: true, createdAt: true, lastSeenAt: true, avatarKey: true,
      address: { select: { division: true, district: true, upazila: true, union: true, street: true, postOffice: true } },
    },
  });
  if (!u) throw new AppError("NOT_FOUND");
  const [log, avatarUrl, owner, tenant] = await Promise.all([
    db.accountStatusLog.findMany({ where: { userId: id }, orderBy: { id: "desc" }, take: 50, select: { id: true, action: true, comment: true, adminUsername: true, createdAt: true } }),
    u.avatarKey ? signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null),
    u.role !== "OWNER" ? null : Promise.all([
      db.property.count({ where: { ownerId: id, archivedAt: null } }),
      db.unit.count({ where: { property: { ownerId: id, archivedAt: null }, archivedAt: null } }),
      db.listing.count({ where: { sellerId: id, status: "PUBLISHED" } }),
      db.userSubscription.findFirst({ where: { userId: id, audience: "OWNER", status: { in: ["ACTIVE", "GRACE"] } }, orderBy: { createdAt: "desc" }, select: { endsAt: true, plan: { select: { nameEn: true, nameBn: true } } } }),
    ]),
    u.role !== "TENANT" ? null : db.rentalAgreement.findFirst({
      where: { tenantId: id, status: "ACTIVE" }, orderBy: { startDate: "desc" },
      select: { rent: true, startDate: true, endDate: true, ownerId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
    }),
  ]);
  const landlord = tenant ? await db.user.findUnique({ where: { id: tenant.ownerId }, select: { fullName: true } }) : null;
  const { avatarKey, address, status, warnedAt, nidLast4, ...rest } = u;
  return {
    ...rest, avatarUrl, state: accountState({ status, warnedAt }), address: addressText(address), nid: nidLast4 ? `•••••••••${nidLast4}` : null, log,
    owner: owner ? { properties: owner[0], units: owner[1], listings: owner[2], plan: owner[3] ? { nameEn: owner[3].plan.nameEn, nameBn: owner[3].plan.nameBn, endsAt: owner[3].endsAt } : null } : null,
    tenancy: tenant ? { unit: tenant.unit.unitNumber, property: tenant.unit.property.name, owner: landlord?.fullName ?? "", rent: tenant.rent.toString(), startDate: tenant.startDate, endDate: tenant.endDate } : null,
  };
}

/** Active, Warning or Suspended. Warning and Suspended need a written reason; it goes to the person and into the permanent log. */
export async function setPersonStatus(actor: Actor, id: string, input: ReturnType<typeof personStatusSchema.parse>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const u = await tx.user.findFirst({ where: { id, role: { in: [...KINDS] }, archivedAt: null }, select: { id: true, role: true, status: true, warnedAt: true } });
    if (!u) throw new AppError("NOT_FOUND");
    const before = accountState(u);
    if (before === input.status && !input.comment) return { id, state: before, changed: false as const };
    const comment = input.status === "ACTIVE" ? input.comment ?? null : input.comment!;
    await tx.user.update({ where: { id }, data: { status: input.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE", warnedAt: input.status === "WARNING" ? new Date() : null } });
    await tx.accountStatusLog.create({ data: { userId: id, adminId: actor.id, adminUsername: actor.username, action: input.status, comment } });
    const key = input.status === "WARNING" ? "accountWarning" : input.status === "SUSPENDED" ? "accountSuspended" : "accountRestored";
    await notify([id], { type: `account.${input.status.toLowerCase()}`, titleKey: `notifications.${key}`, params: input.status === "ACTIVE" ? {} : { reason: comment ?? "" }, link: HOME[u.role as (typeof KINDS)[number]], priority: input.status === "ACTIVE" ? "NORMAL" : "HIGH" }, tx);
    await writeAudit({ actor, action: `person.${input.status.toLowerCase()}`, resourceType: "User", resourceId: id, before: { state: before }, after: { state: input.status, comment }, req }, tx);
    return { id, state: input.status, changed: true as const };
  });
}

