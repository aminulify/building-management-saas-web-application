import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { monthStart } from "@/modules/rent/billing";
import { nextPayment } from "@/modules/rent/next-payment";
import { signStorageKey } from "@/modules/uploads/service";

const url = (key: string | null) => (key ? signStorageKey(key, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null));

/** "Mirpur, DOHS, Dhaka - 1311": the written address of the property, for the SOS form and the lease card. */
export function addressLine(p: { locationText: string | null; address: { area: string | null; upazila: string | null; district: string; postalCode: string | null } | null }) {
  const a = p.address;
  const place = p.locationText || [a?.area, a?.upazila, a?.district].filter(Boolean).join(", ");
  return a?.postalCode ? `${place} - ${a.postalCode}` : place;
}

export async function tenantDashboard(actor: Actor) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const agreement = await db.rentalAgreement.findFirst({
    where: { tenantId: actor.id, status: "ACTIVE" },
    include: { unit: { select: { unitNumber: true, floor: true, areaSqft: true, bedrooms: true, bathrooms: true, utilityCharge: true, property: { select: { id: true, name: true, locationText: true, address: true } } } } },
  });
  if (!agreement) return { tenancy: null };

  const [owner, ownerProfile, current, overdue, records, lastPaid, maintenance, unreadNotifications, openSos] = await Promise.all([
    db.user.findUnique({ where: { id: agreement.ownerId }, select: { id: true, fullName: true, ownerCode: true, phone: true, avatarKey: true } }),
    db.ownerProfile.findUnique({ where: { userId: agreement.ownerId }, select: { bkashNumber: true } }),
    db.rentRecord.findUnique({ where: { agreementId_billingMonth: { agreementId: agreement.id, billingMonth: monthStart() } } }),
    db.rentRecord.aggregate({ where: { agreementId: agreement.id, status: "OVERDUE" }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    db.rentRecord.findMany({ where: { agreementId: agreement.id }, orderBy: { billingMonth: "desc" }, take: 24, include: { payments: { where: { status: "PENDING" }, select: { id: true, amount: true, method: true, paidAt: true } } } }),
    db.rentPayment.findFirst({ where: { status: "VERIFIED", rentRecord: { agreementId: agreement.id } }, orderBy: { paidAt: "desc" }, select: { paidAt: true, amount: true } }),
    db.maintenanceRequest.groupBy({ by: ["status"], where: { tenantId: actor.id }, _count: { _all: true } }),
    db.notification.count({ where: { userId: actor.id, readAt: null, archivedAt: null } }),
    db.emergencyAlert.count({ where: { reporterId: actor.id, status: { in: ["NEED_ACTION", "PROCESSING"] } } }),
  ]);

  const daysToDue = current ? Math.ceil((current.dueDate.getTime() - Date.now()) / 86400_000) : null;
  const monthly = Number(agreement.rent) + Number(agreement.unit.utilityCharge);
  const next = nextPayment(records.map((r) => ({ id: r.id, billingMonth: r.billingMonth, total: Number(r.total), paid: Number(r.paid), dueDate: r.dueDate, status: r.status })), monthly);
  const target = next.recordId ? records.find((r) => r.id === next.recordId) : undefined;
  const pending = target?.payments[0] ?? null;
  const prop = agreement.unit.property;

  return {
    tenancy: {
      id: agreement.id, rent: agreement.rent.toFixed(2), deposit: agreement.deposit.toFixed(2), startDate: agreement.startDate, endDate: agreement.endDate, unit: agreement.unit,
      property: { id: prop.id, name: prop.name, addressLine: addressLine(prop) },
      hasAgreementDocument: !!agreement.agreementDocKey,
      agreementType: agreement.agreementDocKey ? (/\.pdf$/i.test(agreement.agreementDocKey) ? ("pdf" as const) : ("image" as const)) : null,
      owner: owner ? { id: owner.id, fullName: owner.fullName, ownerCode: owner.ownerCode, phone: owner.phone, avatarUrl: await url(owner.avatarKey) } : null,
    },
    nextPayment: {
      ...next, amount: next.amount.toFixed(2), month: next.month, lastPaidAt: lastPaid?.paidAt ?? null, lastPaidAmount: lastPaid ? Number(lastPaid.amount).toFixed(2) : null,
      pending: pending ? { id: pending.id, amount: Number(pending.amount).toFixed(2), method: pending.method, sentAt: pending.paidAt } : null,
      /** where to send the money: the owner's bKash number, or their phone when none was set */
      payTo: ownerProfile?.bkashNumber ?? owner?.phone ?? null,
    },
    rent: current
      ? { month: current.billingMonth.toISOString().slice(0, 7), total: current.total.toFixed(2), paid: current.paid.toFixed(2), balance: current.total.minus(current.paid).toFixed(2), status: current.status, dueDate: current.dueDate, daysToDue }
      : null,
    overdue: { records: overdue._count._all, amount: (overdue._sum.total ?? new Prisma.Decimal(0)).minus(overdue._sum.paid ?? 0).toFixed(2) },
    maintenance: Object.fromEntries(maintenance.map((m) => [m.status, m._count._all])),
    unreadNotifications,
    activeSos: openSos,
  };
}

export type ActivityKind = "payment" | "repair" | "incident" | "sos";

/** Recent Activity: the tenant's latest rent payments, repair requests, incident reports and emergency alerts in one list, newest first. */
export async function tenantActivity(actor: Actor, limit: number) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const [pay, rep, inc, sos] = await Promise.all([
    db.rentPayment.findMany({ where: { rentRecord: { agreement: { tenantId: actor.id } } }, orderBy: { id: "desc" }, take: limit, select: { id: true, amount: true, status: true, paidAt: true, rentRecord: { select: { billingMonth: true } } } }),
    db.maintenanceRequest.findMany({ where: { tenantId: actor.id }, orderBy: { id: "desc" }, take: limit, select: { id: true, title: true, status: true, createdAt: true } }),
    db.complaint.findMany({ where: { reporterId: actor.id }, orderBy: { id: "desc" }, take: limit, select: { id: true, subject: true, status: true, createdAt: true } }),
    db.emergencyAlert.findMany({ where: { reporterId: actor.id }, orderBy: { id: "desc" }, take: limit, select: { id: true, type: true, status: true, createdAt: true } }),
  ]);
  const items = [
    ...pay.map((p) => ({ kind: "payment" as const, id: p.id, title: null, status: p.status as string, amount: Number(p.amount).toFixed(2), month: p.rentRecord.billingMonth.toISOString().slice(0, 7), at: p.paidAt })),
    ...rep.map((r) => ({ kind: "repair" as const, id: r.id, title: r.title, status: r.status as string, amount: null, month: null, at: r.createdAt })),
    ...inc.map((c) => ({ kind: "incident" as const, id: c.id, title: c.subject, status: c.status as string, amount: null, month: null, at: c.createdAt })),
    ...sos.map((s) => ({ kind: "sos" as const, id: s.id, title: s.type as string, status: s.status as string, amount: null, month: null, at: s.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}
