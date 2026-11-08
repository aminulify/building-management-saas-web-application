import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { monthStart } from "@/modules/rent/billing";

export async function tenantDashboard(actor: Actor) {
  requireRole(actor, "TENANT");
  const agreement = await db.rentalAgreement.findFirst({
    where: { tenantId: actor.id, status: "ACTIVE" },
    include: { unit: { select: { unitNumber: true, floor: true, areaSqft: true, bedrooms: true, bathrooms: true, property: { select: { id: true, name: true } } } } },
  });
  if (!agreement) return { tenancy: null };

  const [owner, current, overdue, recentPayments, maintenance, unreadNotifications, openSos] = await Promise.all([
    db.user.findUnique({ where: { id: agreement.ownerId }, select: { id: true, fullName: true, ownerCode: true } }),
    db.rentRecord.findUnique({ where: { agreementId_billingMonth: { agreementId: agreement.id, billingMonth: monthStart() } } }),
    db.rentRecord.aggregate({ where: { agreementId: agreement.id, status: "OVERDUE" }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    db.rentPayment.findMany({ where: { rentRecord: { agreementId: agreement.id } }, orderBy: { id: "desc" }, take: 5, select: { id: true, amount: true, method: true, paidAt: true } }),
    db.maintenanceRequest.groupBy({ by: ["status"], where: { tenantId: actor.id }, _count: { _all: true } }),
    db.notification.count({ where: { userId: actor.id, readAt: null, archivedAt: null } }),
    db.emergencyAlert.count({ where: { reporterId: actor.id, status: { in: ["NEED_ACTION", "PROCESSING"] } } }),
  ]);

  const daysToDue = current ? Math.ceil((current.dueDate.getTime() - Date.now()) / 86400_000) : null;
  return {
    tenancy: { id: agreement.id, rent: agreement.rent.toFixed(2), deposit: agreement.deposit.toFixed(2), startDate: agreement.startDate, endDate: agreement.endDate, unit: agreement.unit, owner },
    rent: current
      ? { month: current.billingMonth.toISOString().slice(0, 7), total: current.total.toFixed(2), paid: current.paid.toFixed(2), balance: current.total.minus(current.paid).toFixed(2), status: current.status, dueDate: current.dueDate, daysToDue }
      : null,
    overdue: { records: overdue._count._all, amount: (overdue._sum.total ?? new Prisma.Decimal(0)).minus(overdue._sum.paid ?? 0).toFixed(2) },
    recentPayments,
    maintenance: Object.fromEntries(maintenance.map((m) => [m.status, m._count._all])),
    unreadNotifications,
    activeSos: openSos,
  };
}
