import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { signStorageKey } from "@/modules/uploads/service";
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
