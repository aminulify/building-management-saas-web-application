import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { computeStatus, ensureRentRecords, monthStart } from "./billing";
import type { paymentSchema } from "./schema";

const D = Prisma.Decimal;

/** Monthly job: one RentRecord per ACTIVE agreement, then flag overdue ones. Safe to re-run. */
export async function generateMonthlyRecords(month = monthStart()) {
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const agreements = await db.rentalAgreement.findMany({
    where: { status: "ACTIVE", startDate: { lte: monthEnd }, OR: [{ endDate: null }, { endDate: { gte: month } }] },
    select: { id: true, rent: true, unit: { select: { utilityCharge: true } } },
  });
  const created = await db.$transaction((tx) => ensureRentRecords(tx, agreements, month));
  const overdue = await db.rentRecord.updateMany({
    where: { status: { in: ["DUE", "PARTIAL"] }, dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
  return { month: month.toISOString().slice(0, 7), agreements: agreements.length, created, markedOverdue: overdue.count };
}

/** Rent Overview: month totals plus one row per tenant record (expected, collected, unpaid, overdue). */
export async function ownerOverview(actor: Actor, month = monthStart()) {
  await authorize(actor, "rent:record", { ownerId: actor.id });
  const records = await db.rentRecord.findMany({
    where: { billingMonth: month, agreement: { ownerId: actor.id } },
    select: { id: true, total: true, paid: true, status: true, dueDate: true, agreement: { select: { id: true, tenantId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } },
    orderBy: { id: "asc" },
  });
  const sum = (f: (r: (typeof records)[number]) => Prisma.Decimal) => records.reduce((s, r) => s.plus(f(r)), new D(0));
  const expected = sum((r) => r.total);
  const collected = sum((r) => r.paid);
  const overdue = records.filter((r) => r.status === "OVERDUE").reduce((s, r) => s.plus(r.total).minus(r.paid), new D(0));
  const byStatus = { DUE: 0, PARTIAL: 0, PAID: 0, OVERDUE: 0 };
  for (const r of records) byStatus[r.status]++;
  const names = new Map((await db.user.findMany({ where: { id: { in: records.map((r) => r.agreement.tenantId) } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return {
    month: month.toISOString().slice(0, 7),
    expected: expected.toFixed(2), collected: collected.toFixed(2), outstanding: expected.minus(collected).toFixed(2), overdue: overdue.toFixed(2),
    collectionRate: expected.gt(0) ? Number(collected.div(expected).mul(100).toFixed(1)) : 0,
    records: records.length, byStatus,
    rows: records.map((r) => ({ recordId: r.id, agreementId: r.agreement.id, tenant: names.get(r.agreement.tenantId) ?? null, property: r.agreement.unit.property.name, unit: r.agreement.unit.unitNumber, dueDate: r.dueDate, total: r.total.toFixed(2), paid: r.paid.toFixed(2), status: r.status })),
  };
}

async function loadAgreementFor(actor: Actor, agreementId: string) {
  const a = await db.rentalAgreement.findUnique({ where: { id: agreementId } });
  if (!a) throw new AppError("NOT_FOUND");
  await authorize(actor, "tenancy:read", { ownerId: a.ownerId, tenantId: a.tenantId, readOnly: false });
  return a;
}

export async function listRecords(actor: Actor, agreementId: string, status?: string) {
  await loadAgreementFor(actor, agreementId);
  return db.rentRecord.findMany({
    where: { agreementId, status: status as never },
    include: { payments: { orderBy: { paidAt: "desc" } } },
    orderBy: { billingMonth: "desc" },
    take: 36,
  });
}

/** Tenant self view: all of my records across my agreements. */
export async function tenantRecords(actor: Actor) {
  await authorize(actor, "rent:pay", { ownerId: actor.id });
  return db.rentRecord.findMany({
    where: { agreement: { tenantId: actor.id } },
    include: { payments: { orderBy: { paidAt: "desc" } }, agreement: { select: { unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } },
    orderBy: { billingMonth: "desc" },
    take: 36,
  });
}

/** Owner records a payment received (cash or digital). Partial payments allowed; overpayment rejected. */
export async function recordPayment(actor: Actor, recordId: string, input: z.infer<typeof paymentSchema>, req: Request) {
  const rec = await db.rentRecord.findUnique({ where: { id: recordId }, include: { agreement: true } });
  if (!rec) throw new AppError("NOT_FOUND");
  await authorize(actor, "rent:record", { ownerId: rec.agreement.ownerId });

  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RentRecord" WHERE id = ${recordId}::uuid FOR UPDATE`;
      const cur = await tx.rentRecord.findUniqueOrThrow({ where: { id: recordId } });
      const amount = new D(input.amount);
      const remaining = cur.total.minus(cur.paid);
      if (remaining.lte(0)) throw new AppError("INVALID_STATE", { reason: "already_paid" });
      if (amount.gt(remaining)) throw new AppError("VALIDATION_ERROR", [{ path: "amount", code: "exceeds_balance", max: remaining.toFixed(2) }]);

      const payment = await tx.rentPayment.create({
        data: { rentRecordId: recordId, amount, method: input.method, reference: input.reference?.toUpperCase(), paidAt: input.paidAt, recordedById: actor.id, status: input.verified ? "VERIFIED" : "PENDING" },
      });
      const paid = input.verified ? cur.paid.plus(amount) : cur.paid;
      const record = input.verified ? await tx.rentRecord.update({ where: { id: recordId }, data: { paid, status: computeStatus(cur.total, paid, cur.dueDate) } }) : cur;
      await notify([rec.agreement.tenantId], { type: "rent.payment", titleKey: "notifications.rentPaymentRecorded", params: { amount: amount.toFixed(2) } }, tx);
      await writeAudit({ actor, action: "rent.payment", resourceType: "RentPayment", resourceId: payment.id, after: { recordId, amount: amount.toFixed(2), method: input.method }, req }, tx);
      return { payment, record };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { field: "reference" });
    throw e;
  }
}

export async function receipt(actor: Actor, paymentId: string) {
  const p = await db.rentPayment.findUnique({
    where: { id: paymentId },
    include: { rentRecord: { include: { agreement: { include: { unit: { include: { property: true } } } } } } },
  });
  if (!p) throw new AppError("NOT_FOUND");
  const a = p.rentRecord.agreement;
  await authorize(actor, "tenancy:read", { ownerId: a.ownerId, tenantId: a.tenantId, readOnly: false });

  const [owner, tenant] = await Promise.all([
    db.user.findUnique({ where: { id: a.ownerId }, select: { fullName: true, ownerCode: true } }),
    db.user.findUnique({ where: { id: a.tenantId }, select: { fullName: true, username: true } }),
  ]);
  const month = p.rentRecord.billingMonth.toISOString().slice(0, 7);
  return {
    receiptNo: `RC-${month.replace("-", "")}-${p.id.slice(-8).toUpperCase()}`,
    issuedAt: p.paidAt, billingMonth: month,
    owner, tenant,
    property: a.unit.property.name, unit: a.unit.unitNumber, floor: a.unit.floor,
    amount: p.amount.toFixed(2), method: p.method, reference: p.reference,
    recordTotal: p.rentRecord.total.toFixed(2), recordPaid: p.rentRecord.paid.toFixed(2),
    balance: p.rentRecord.total.minus(p.rentRecord.paid).toFixed(2), currency: "BDT",
  };
}

export async function remindTenant(actor: Actor, recordId: string) {
  const rec = await db.rentRecord.findUnique({ where: { id: recordId }, include: { agreement: true } });
  if (!rec) throw new AppError("NOT_FOUND");
  await authorize(actor, "rent:record", { ownerId: rec.agreement.ownerId });
  if (rec.status === "PAID") throw new AppError("INVALID_STATE", { reason: "already_paid" });
  rateLimit(`remind:${recordId}`, 1, 24 * 3600_000);
  await notify([rec.agreement.tenantId], {
    type: "rent.reminder", titleKey: "notifications.rentReminder",
    params: { due: rec.total.minus(rec.paid).toFixed(2), month: rec.billingMonth.toISOString().slice(0, 7) },
  });
  return { sent: true };
}
