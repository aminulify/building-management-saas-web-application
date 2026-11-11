import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { addressLine } from "@/modules/dashboards/tenant";
import { GRACE_DAY, isLate, ledgerState, tenureYears, unpaidSummary } from "./history-math";

export const RECENT = 4;
export const historyRecordsQuery = z.object({
  offset: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

type RecordRow = Awaited<ReturnType<typeof loadRecords>>[number];

const loadRecords = (agreementId: string, skip: number, take: number) =>
  db.rentRecord.findMany({
    where: { agreementId }, orderBy: { billingMonth: "desc" }, skip, take,
    include: { payments: { select: { id: true, status: true, method: true, paidAt: true, amount: true }, orderBy: { paidAt: "desc" } } },
  });

/** One row of the Payment Ledger. */
function ledgerRow(r: RecordRow, now: Date) {
  const total = Number(r.total);
  const paid = Number(r.paid);
  const pending = r.payments.find((p) => p.status === "PENDING") ?? null;
  const lastPaid = r.payments.find((p) => p.status === "VERIFIED") ?? null;
  const month = r.billingMonth.toISOString().slice(0, 7);
  const state = ledgerState({ total, paid }, !!pending);
  return {
    recordId: r.id, month, amount: r.total.toFixed(2), paid: r.paid.toFixed(2), owed: Math.max(0, total - paid).toFixed(2),
    state, late: state !== "PAID" && isLate(month, now),
    pending: pending ? { id: pending.id, method: pending.method, sentAt: pending.paidAt, amount: pending.amount.toFixed(2) } : null,
    paidAt: state === "PAID" ? (lastPaid?.paidAt ?? null) : null,
  };
}

/**
 * `GET /tenant/history`: every stay of this tenant (current and past) with the landlord, the unit and the latest rent
 * rows, plus the three numbers on top (years rented, properties lived in, unpaid balance).
 */
export async function tenantHistory(actor: Actor) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const now = new Date();
  const agreements = await db.rentalAgreement.findMany({
    where: { tenantId: actor.id, status: { in: ["ACTIVE", "ENDED", "TERMINATED"] } },
    orderBy: [{ startDate: "desc" }],
    take: 50,
    include: { unit: { select: { unitNumber: true, floor: true, propertyId: true, property: { select: { id: true, name: true, locationText: true, address: { select: { area: true, upazila: true, district: true, postalCode: true } } } } } } },
  });
  const ownerIds = [...new Set(agreements.map((a) => a.ownerId))];
  const ids = agreements.map((a) => a.id);
  const [owners, profiles, open, first, ledgers] = await Promise.all([
    db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, fullName: true, ownerCode: true, phone: true } }),
    db.ownerProfile.findMany({ where: { userId: { in: ownerIds } }, select: { userId: true, bkashNumber: true } }),
    db.rentRecord.findMany({ where: { agreementId: { in: ids }, status: { not: "PAID" } }, select: { billingMonth: true, total: true, paid: true } }),
    db.rentRecord.findFirst({ where: { agreementId: { in: ids } }, orderBy: { billingMonth: "asc" }, select: { billingMonth: true } }),
    Promise.all(agreements.map(async (a) => ({ id: a.id, rows: await loadRecords(a.id, 0, RECENT + 1), count: await db.rentRecord.count({ where: { agreementId: a.id } }) }))),
  ]);
  const owner = new Map(owners.map((o) => [o.id, o]));
  const bkash = new Map(profiles.map((p) => [p.userId, p.bkashNumber]));
  const ledger = new Map(ledgers.map((l) => [l.id, l]));

  const stays = agreements
    .map((a) => {
      const o = owner.get(a.ownerId);
      const l = ledger.get(a.id)!;
      const active = a.status === "ACTIVE";
      return {
        id: a.id, status: active ? ("ACTIVE" as const) : ("COMPLETED" as const),
        startDate: a.startDate, endDate: active ? null : a.endDate, rent: a.rent.toFixed(2),
        property: { id: a.unit.property.id, name: a.unit.property.name, addressLine: addressLine(a.unit.property) },
        unit: { unitNumber: a.unit.unitNumber, floor: a.unit.floor },
        landlord: o ? { id: o.id, fullName: o.fullName, ownerCode: o.ownerCode } : null,
        /** where to send money for a Send Paid Request: the landlord's bKash number, or their phone */
        payTo: active ? (bkash.get(a.ownerId) ?? o?.phone ?? null) : null,
        ledger: { items: l.rows.slice(0, RECENT).map((r) => ledgerRow(r, now)), hasMore: l.count > RECENT, total: l.count },
      };
    })
    .sort((x, y) => Number(y.status === "ACTIVE") - Number(x.status === "ACTIVE") || y.startDate.getTime() - x.startDate.getTime());

  const props = new Map<string, string>();
  for (const a of agreements) props.set(a.unit.propertyId, a.unit.property.name);
  const unpaid = unpaidSummary(open.map((r) => ({ month: r.billingMonth.toISOString().slice(0, 7), owed: Number(r.total) - Number(r.paid) })), now);
  const lateMonths = open.filter((r) => Number(r.total) - Number(r.paid) > 0.004 && isLate(r.billingMonth.toISOString().slice(0, 7), now)).length;
  const earliest = agreements.reduce<Date | null>((m, a) => (!m || a.startDate < m ? a.startDate : m), null);

  return {
    summary: {
      yearsRented: tenureYears(agreements.map((a) => ({ start: a.startDate, end: a.status === "ACTIVE" ? null : a.endDate })), now),
      since: earliest,
      properties: props.size,
      propertyNames: [...props.values()],
      unpaid: { amount: unpaid.amount.toFixed(2), late: unpaid.late.toFixed(2), state: unpaid.state, months: open.length, lateMonths, graceDay: GRACE_DAY },
      firstRecordMonth: first ? first.billingMonth.toISOString().slice(0, 7) : null,
    },
    stays,
  };
}

/** `GET /tenant/history/:agreementId/records`: more rent rows of one stay ("View All Receipts"). */
export async function tenantHistoryRecords(actor: Actor, agreementId: string, q: z.infer<typeof historyRecordsQuery>) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const a = await db.rentalAgreement.findUnique({ where: { id: agreementId }, select: { tenantId: true } });
  if (!a) throw new AppError("NOT_FOUND");
  if (a.tenantId !== actor.id) throw new AppError("FORBIDDEN");
  const rows = await loadRecords(agreementId, q.offset, q.limit + 1);
  const now = new Date();
  return { items: rows.slice(0, q.limit).map((r) => ledgerRow(r, now)), hasMore: rows.length > q.limit };
}

/** `GET /tenant/rent/:recordId/invoice`: everything printed on the PDF invoice of a fully paid month. */
export async function tenantInvoice(actor: Actor, recordId: string) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const r = await db.rentRecord.findUnique({
    where: { id: recordId },
    include: {
      payments: { where: { status: "VERIFIED" }, orderBy: { paidAt: "asc" } },
      agreement: { include: { unit: { select: { unitNumber: true, floor: true, property: { select: { name: true } } } } } },
    },
  });
  if (!r) throw new AppError("NOT_FOUND");
  if (r.agreement.tenantId !== actor.id) throw new AppError("FORBIDDEN");
  if (Number(r.total) - Number(r.paid) > 0.004 || r.payments.length === 0) throw new AppError("INVALID_STATE", { reason: "not_paid" });
  const [owner, tenant] = await Promise.all([
    db.user.findUnique({ where: { id: r.agreement.ownerId }, select: { fullName: true, ownerCode: true, phone: true } }),
    db.user.findUnique({ where: { id: actor.id }, select: { fullName: true, username: true, phone: true } }),
  ]);
  const month = r.billingMonth.toISOString().slice(0, 7);
  const last = r.payments[r.payments.length - 1]!;
  return {
    invoiceNo: `INV-${month.replace("-", "")}-${r.id.slice(-8).toUpperCase()}`,
    billingMonth: month, paidAt: last.paidAt,
    methods: [...new Set(r.payments.map((p) => p.method))], reference: last.reference,
    owner, tenant, property: r.agreement.unit.property.name, unit: r.agreement.unit.unitNumber, floor: r.agreement.unit.floor,
    items: { rent: r.rent.toFixed(2), utility: r.utility.toFixed(2), other: r.other.toFixed(2) },
    total: r.total.toFixed(2), paid: r.paid.toFixed(2),
    payments: r.payments.map((p) => ({ amount: p.amount.toFixed(2), method: p.method, reference: p.reference, paidAt: p.paidAt })),
    currency: "BDT",
  };
}
