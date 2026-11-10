import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { randomToken, sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { requireRole } from "@/lib/authz/authorize";
import { signStorageKey } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { loadUnit } from "@/modules/properties/access";
import { ensureRentRecords, monthStart } from "@/modules/rent/billing";
import type { endTenancySchema, inviteSchema, tenancyListQuery, tenancyUpdateSchema } from "./schema";

const INVITE_TTL_MS = 7 * 24 * 3600_000;

export async function inviteTenant(actor: Actor, input: z.infer<typeof inviteSchema>, req: Request) {
  const unit = await loadUnit(actor, input.unitId, "manage");
  await authorize(actor, "tenancy:manage", { ownerId: unit.property.ownerId });
  if (unit.archivedAt || unit.availability !== "AVAILABLE") throw new AppError("INVALID_STATE", { reason: "unit_not_available" });

  const token = randomToken();
  const inv = await db.$transaction(async (tx) => {
    await tx.tenantInvitation.deleteMany({ where: { unitId: unit.id, acceptedAt: null } }); // one open invite per unit
    const i = await tx.tenantInvitation.create({
      data: {
        ownerId: actor.id, unitId: unit.id, email: input.email, phone: input.phone, tokenHash: sha256(token),
        rent: input.rent ?? unit.rent, deposit: input.deposit ?? unit.deposit,
        startDate: input.startDate, endDate: input.endDate, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await writeAudit({ actor, action: "tenancy.invite", resourceType: "TenantInvitation", resourceId: i.id, req }, tx);
    return i;
  });
  // The raw token is returned once (to be delivered by email/SMS); only its hash is stored.
  return { id: inv.id, token, expiresAt: inv.expiresAt };
}

/** A GENERAL_USER or TENANT accepts; GENERAL_USER becomes TENANT (D13). Owners/admins cannot accept. */
export async function acceptInvitation(actor: Actor, token: string) {
  if (actor.role !== "TENANT" && actor.role !== "GENERAL_USER") throw new AppError("FORBIDDEN", { reason: "role_cannot_rent" });
  const inv = await db.tenantInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { unit: { include: { property: true } } } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new AppError("NOT_FOUND");

  const me = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { email: true, phone: true } });
  const matches = (inv.email && inv.email === me.email) || (inv.phone && inv.phone === me.phone);
  if (!matches) throw new AppError("FORBIDDEN", { reason: "invitation_not_for_you" });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Unit" WHERE id = ${inv.unitId}::uuid FOR UPDATE`;
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: inv.unitId } });
    const active = await tx.rentalAgreement.count({ where: { unitId: unit.id, status: "ACTIVE" } });
    if (unit.availability !== "AVAILABLE" || active > 0) throw new AppError("INVALID_STATE", { reason: "unit_not_available" });

    const agreement = await tx.rentalAgreement.create({
      data: {
        unitId: unit.id, tenantId: actor.id, ownerId: inv.ownerId, rent: inv.rent, deposit: inv.deposit,
        startDate: inv.startDate, endDate: inv.endDate, status: "ACTIVE",
      },
    });
    await tx.unit.update({ where: { id: unit.id }, data: { availability: "OCCUPIED" } });
    await tx.tenantInvitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    if (actor.role === "GENERAL_USER") await tx.user.update({ where: { id: actor.id }, data: { role: "TENANT" } });
    await tx.tenantProfile.upsert({ where: { userId: actor.id }, update: {}, create: { userId: actor.id } });

    await ensureRentRecords(tx, [{ id: agreement.id, rent: agreement.rent, unit: { utilityCharge: unit.utilityCharge } }], monthStart());
    await notify([inv.ownerId], { type: "tenancy.accepted", titleKey: "notifications.tenancyAccepted", params: { unit: unit.unitNumber }, link: `/owner/tenants` }, tx);
    await writeAudit({ actor, action: "tenancy.accept", resourceType: "RentalAgreement", resourceId: agreement.id }, tx);
    return agreement;
  });
}

export async function listTenancies(actor: Actor, q: z.infer<typeof tenancyListQuery>) {
  await authorize(actor, "tenancy:read", { ownerId: actor.id, tenantId: actor.id, readOnly: true });
  const scope = actor.role === "OWNER" ? { ownerId: actor.id } : actor.role === "TENANT" ? { tenantId: actor.id } : {};
  const rows = await db.rentalAgreement.findMany({
    where: { ...scope, status: q.status },
    include: { unit: { select: { unitNumber: true, floor: true, areaSqft: true, property: { select: { id: true, name: true } } } } },
    orderBy: { id: "desc" },
    take: 100,
  });
  // enrich with the tenant's public identity (owners/admins only; tenants already know their own)
  const tenants = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.tenantId) } },
    select: { id: true, fullName: true, username: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));
  return rows.map((r) => ({ ...r, tenant: byId.get(r.tenantId) ?? null }));
}

async function loadAgreement(actor: Actor, id: string, mode: "read" | "manage") {
  const a = await db.rentalAgreement.findUnique({ where: { id }, include: { unit: { include: { property: true } } } });
  if (!a) throw new AppError("NOT_FOUND");
  await authorize(actor, mode === "read" ? "tenancy:read" : "tenancy:manage", {
    ownerId: a.ownerId, tenantId: a.tenantId, readOnly: mode === "read",
  });
  return a;
}

export const getTenancy = (actor: Actor, id: string) => loadAgreement(actor, id, "read");

export async function updateTenancy(actor: Actor, id: string, data: z.infer<typeof tenancyUpdateSchema>, req: Request) {
  const a = await loadAgreement(actor, id, "manage");
  if (a.status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "not_active" });
  if (data.endDate && data.endDate <= a.startDate) throw new AppError("VALIDATION_ERROR", [{ path: "endDate", code: "end_after_start" }]);
  return db.$transaction(async (tx) => {
    const { noticeGiven, ...fields } = data;
    const out = await tx.rentalAgreement.update({ where: { id }, data: { ...fields, ...(noticeGiven === undefined ? {} : { noticeGivenAt: noticeGiven ? (a.noticeGivenAt ?? new Date()) : null }) } });
    await writeAudit({ actor, action: "tenancy.update", resourceType: "RentalAgreement", resourceId: id, after: JSON.parse(JSON.stringify(data)), req }, tx);
    return out;
  });
}

export async function endTenancy(actor: Actor, id: string, input: z.infer<typeof endTenancySchema>, req: Request) {
  const a = await loadAgreement(actor, id, "manage");
  if (a.status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "not_active" });
  return db.$transaction(async (tx) => {
    const out = await tx.rentalAgreement.update({
      where: { id },
      data: { status: input.terminated ? "TERMINATED" : "ENDED", endDate: input.endDate ?? new Date(), settlementAmount: input.settlementAmount },
    });
    await tx.unit.update({ where: { id: a.unitId }, data: { availability: "AVAILABLE" } });
    await notify([a.tenantId], { type: "tenancy.ended", titleKey: "notifications.tenancyEnded", params: { unit: a.unit.unitNumber } }, tx);
    await writeAudit({ actor, action: "tenancy.end", resourceType: "RentalAgreement", resourceId: id, after: { terminated: input.terminated, reason: input.reason ?? null }, req }, tx);
    return out;
  });
}

const maskEmail = (e: string | null) => (e ? e.replace(/^(.).*(@.*)$/, "$1•••$2") : null);

/**
 * Owner finds a registered tenant by their FULL phone number or exact e-mail (rate limited), so accounts
 * cannot be browsed. Returns just enough to confirm it is the right person (e-mail is masked).
 */
export async function lookupTenant(actor: Actor, q: { phone?: string; email?: string }) {
  requireRole(actor, "OWNER");
  rateLimit(`tenant-lookup:${actor.id}`, 30, 60_000);
  const u = await db.user.findFirst({
    where: { ...(q.phone ? { phone: q.phone } : { email: q.email }), status: "ACTIVE", role: { in: ["TENANT", "GENERAL_USER"] }, id: { not: actor.id } },
    select: { id: true, fullName: true, phone: true, email: true, avatarKey: true },
  });
  if (!u) return { found: false as const };
  const busy = await db.rentalAgreement.count({ where: { tenantId: u.id, status: "ACTIVE" } });
  return {
    found: true as const,
    tenant: { id: u.id, fullName: u.fullName, phone: u.phone, email: maskEmail(u.email), avatarUrl: u.avatarKey ? await signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : null, hasActiveTenancy: busy > 0 },
  };
}
