import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";

export const agreementSchema = z.object({ storageKey: z.string().min(10).max(300) });

async function load(actor: Actor, id: string, mode: "read" | "manage") {
  const a = await db.rentalAgreement.findUnique({ where: { id } });
  if (!a) throw new AppError("NOT_FOUND");
  await authorize(actor, mode === "read" ? "tenancy:read" : "tenancy:manage", { ownerId: a.ownerId, tenantId: a.tenantId, readOnly: false });
  return a;
}

/** Owner attaches the signed agreement PDF/image (Add Tenant → Upload Agreement). */
export async function attachAgreement(actor: Actor, id: string, storageKey: string, req: Request) {
  await load(actor, id, "manage");
  const [purpose, owner] = storageKey.split("/");
  if (purpose !== "AGREEMENT" || owner !== actor.id) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  const out = await db.rentalAgreement.update({ where: { id }, data: { agreementDocKey: storageKey }, select: { id: true, agreementDocKey: true } });
  await writeAudit({ actor, action: "tenancy.agreement_upload", resourceType: "RentalAgreement", resourceId: id, req });
  return out;
}

/** Owner and tenant of the agreement (and Super Admin) get a 5-minute download link. */
export async function agreementUrl(actor: Actor, id: string) {
  const a = await load(actor, id, "read");
  if (!a.agreementDocKey) throw new AppError("NOT_FOUND", { reason: "no_agreement_uploaded" });
  return signStorageKey(a.agreementDocKey);
}

/** Tenant "My Rental" page. */
export async function myRental(actor: Actor) {
  await authorize(actor, "tenancy:read", { tenantId: actor.id });
  const a = await db.rentalAgreement.findFirst({
    where: { tenantId: actor.id, status: "ACTIVE" },
    include: { unit: { include: { property: { include: { address: true, zone: true } } } } },
  });
  if (!a) throw new AppError("NOT_FOUND", { reason: "no_active_tenancy" });
  const owner = await db.user.findUnique({ where: { id: a.ownerId }, select: { id: true, fullName: true, ownerCode: true } });
  const { unit, ...agreement } = a;
  return {
    agreement: { id: agreement.id, rent: agreement.rent, deposit: agreement.deposit, startDate: agreement.startDate, endDate: agreement.endDate, hasAgreementDocument: !!agreement.agreementDocKey },
    unit: { unitNumber: unit.unitNumber, floor: unit.floor, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, areaSqft: unit.areaSqft, utilityCharge: unit.utilityCharge },
    property: { id: unit.property.id, name: unit.property.name, address: unit.property.address, zone: unit.property.zone },
    owner,
  };
}

const docType = (key: string | null) => (key ? (/\.pdf$/i.test(key) ? ("pdf" as const) : ("image" as const)) : null);

/** Owner Profile → Agreements: every active tenancy with its agreement file state and whether a signature was requested. */
export async function ownerAgreements(actor: Actor) {
  requireRole(actor, "OWNER");
  await authorize(actor, "tenancy:read", { ownerId: actor.id, tenantId: actor.id, readOnly: true });
  const rows = await db.rentalAgreement.findMany({
    where: { ownerId: actor.id, status: "ACTIVE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
    include: { unit: { select: { unitNumber: true, property: { select: { id: true, name: true } } } } },
  });
  const people = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.tenantId) } }, select: { id: true, fullName: true, phone: true, avatarKey: true } })).map((p) => [p.id, p]));
  const urls = await signStorageKeys(rows.flatMap((r) => (people.get(r.tenantId)?.avatarKey ? [people.get(r.tenantId)!.avatarKey!] : [])), 3600);
  return rows.map((r) => {
    const t = people.get(r.tenantId);
    return {
      id: r.id, startDate: r.startDate, endDate: r.endDate, rent: r.rent.toFixed(2), hasDocument: !!r.agreementDocKey, docType: docType(r.agreementDocKey),
      signatureRequestedAt: r.signatureRequestedAt, property: r.unit.property, unit: { unitNumber: r.unit.unitNumber },
      tenant: t ? { id: t.id, fullName: t.fullName, phone: t.phone, avatarUrl: t.avatarKey ? urls.get(t.avatarKey) ?? null : null } : null,
    };
  });
}

/** "Request digital signature": the tenant is notified to review and sign. One request per tenancy per hour. */
export async function requestSignature(actor: Actor, id: string, req: Request) {
  const a = await load(actor, id, "manage");
  if (a.status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "not_active" });
  if (!a.agreementDocKey) throw new AppError("INVALID_STATE", { reason: "no_agreement_uploaded" });
  rateLimit(`sign-request:${id}`, 1, 3600_000);
  const unit = await db.unit.findUniqueOrThrow({ where: { id: a.unitId }, select: { unitNumber: true } });
  return db.$transaction(async (tx) => {
    const out = await tx.rentalAgreement.update({ where: { id }, data: { signatureRequestedAt: new Date() }, select: { id: true, signatureRequestedAt: true } });
    await notify([a.tenantId], { type: "tenancy.signature", titleKey: "notifications.signatureRequested", params: { unit: unit.unitNumber, owner: actor.fullName }, link: "/tenant/rental", priority: "HIGH" }, tx);
    await writeAudit({ actor, action: "tenancy.signature_request", resourceType: "RentalAgreement", resourceId: id, req }, tx);
    return out;
  });
}
