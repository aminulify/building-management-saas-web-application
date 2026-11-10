import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { ensureRentRecords, monthStart } from "@/modules/rent/billing";

/**
 * Owner moves a registered tenant (found by phone) into a vacant unit: an ACTIVE agreement is created at the
 * unit's rent and the unit becomes OCCUPIED, all in the caller's transaction. The tenant is notified.
 * A person with another active tenancy is refused (one home at a time), as is any non-tenant account.
 */
export async function assignTenantInTx(
  tx: Prisma.TransactionClient,
  actor: Actor,
  unitId: string,
  tenantId: string,
  opts: { startDate?: Date; endDate?: Date; members?: number; req?: Request } = {},
) {
  await tx.$queryRaw`SELECT id FROM "Unit" WHERE id = ${unitId}::uuid FOR UPDATE`;
  const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
  if (unit.archivedAt || unit.availability !== "AVAILABLE") throw new AppError("INVALID_STATE", { reason: "unit_not_available" });
  const active = await tx.rentalAgreement.count({ where: { unitId, status: "ACTIVE" } });
  if (active > 0) throw new AppError("INVALID_STATE", { reason: "unit_not_available" });

  const tenant = await tx.user.findUnique({ where: { id: tenantId }, select: { id: true, role: true, status: true } });
  if (!tenant || tenant.status !== "ACTIVE" || (tenant.role !== "TENANT" && tenant.role !== "GENERAL_USER") || tenant.id === actor.id) {
    throw new AppError("VALIDATION_ERROR", [{ path: "tenantId", code: "not_a_tenant" }]);
  }
  if ((await tx.rentalAgreement.count({ where: { tenantId, status: "ACTIVE" } })) > 0) throw new AppError("INVALID_STATE", { reason: "tenant_has_active_tenancy" });

  const startDate = opts.startDate ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const agreement = await tx.rentalAgreement.create({
    data: { unitId, tenantId, ownerId: actor.id, rent: unit.rent, deposit: unit.deposit, startDate, endDate: opts.endDate, members: opts.members ?? 1, status: "ACTIVE" },
  });
  await tx.unit.update({ where: { id: unitId }, data: { availability: "OCCUPIED" } });
  if (tenant.role === "GENERAL_USER") await tx.user.update({ where: { id: tenantId }, data: { role: "TENANT" } });
  await tx.tenantProfile.upsert({ where: { userId: tenantId }, update: {}, create: { userId: tenantId } });
  await ensureRentRecords(tx, [{ id: agreement.id, rent: agreement.rent, unit: { utilityCharge: unit.utilityCharge } }], monthStart());
  await notify([tenantId], { type: "tenancy.assigned", titleKey: "notifications.tenancyAssigned", params: { unit: unit.unitNumber }, link: "/tenant/rental" }, tx);
  await writeAudit({ actor, action: "tenancy.assign", resourceType: "RentalAgreement", resourceId: agreement.id, after: { unitId, tenantId }, req: opts.req }, tx);
  return agreement;
}
