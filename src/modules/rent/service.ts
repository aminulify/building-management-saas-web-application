import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { signStorageKey } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { computeStatus, ensureRentRecords, monthStart } from "./billing";
import type { paymentSchema } from "./schema";

const D = Prisma.Decimal;

/** "RC-202611-AB12CD34": the number printed on a receipt and quoted in the notification. */
export const receiptNumber = (paymentId: string, billingMonth: Date) => `RC-${billingMonth.toISOString().slice(0, 7).replace("-", "")}-${paymentId.slice(-8).toUpperCase()}`;

/** Unit, property and tenant of a rent record: every notification to the owner must name them. */
export async function rentContext(tx: Prisma.TransactionClient, recordId: string) {
  const r = await tx.rentRecord.findUniqueOrThrow({
    where: { id: recordId },
    select: { billingMonth: true, agreement: { select: { tenantId: true, ownerId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } },
  });
  const tenant = await tx.user.findUnique({ where: { id: r.agreement.tenantId }, select: { fullName: true } });
  return { billingMonth: r.billingMonth, ownerId: r.agreement.ownerId, tenantName: tenant?.fullName ?? "", unit: r.agreement.unit.unitNumber, property: r.agreement.unit.property.name };
}

/** Daily: one "overdue" alert per unpaid, past-due rent record for its owner (never twice for the same record). */
export async function notifyOverdue(now = new Date()) {
  const rows = await db.rentRecord.findMany({
    where: { status: { not: "PAID" }, dueDate: { lt: now }, agreement: { status: "ACTIVE" } },
    select: { id: true, total: true, paid: true, billingMonth: true, agreement: { select: { tenantId: true, ownerId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } },
    take: 500,
  });
  if (!rows.length) return 0;
  const done = new Set((await db.notification.findMany({ where: { type: "rent.overdue", userId: { in: [...new Set(rows.map((r) => r.agreement.ownerId))] } }, select: { params: true } })).map((n) => (n.params as { recordId?: string }).recordId));
  const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.agreement.tenantId))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  let n = 0;
  for (const r of rows) {
    if (done.has(r.id)) continue;
    await notify([r.agreement.ownerId], {
      type: "rent.overdue", titleKey: "notifications.rentOverdue", priority: "HIGH", link: "/home-owner/rent",
      params: { recordId: r.id, tenantName: names.get(r.agreement.tenantId) ?? "", unit: r.agreement.unit.unitNumber, property: r.agreement.unit.property.name, due: r.total.minus(r.paid).toFixed(2), month: r.billingMonth.toISOString().slice(0, 7) },
    });
    n++;
  }
  await notifyTenantsLate(rows);
  return n;
}

/** Monthly job: one RentRecord per ACTIVE agreement, then flag overdue ones. Safe to re-run. */

/** The tenant's own "Final Reminder" once per overdue month (the "Violate Agreement" card). */
async function notifyTenantsLate(rows: { id: string; total: Prisma.Decimal; paid: Prisma.Decimal; billingMonth: Date; agreement: { tenantId: string } }[]) {
  const tenantIds = [...new Set(rows.map((r) => r.agreement.tenantId))];
  const done = new Set((await db.notification.findMany({ where: { type: "rent.late", userId: { in: tenantIds } }, select: { params: true } })).map((n) => (n.params as { recordId?: string }).recordId));
  for (const r of rows) {
    if (done.has(r.id)) continue;
    await notify([r.agreement.tenantId], { type: "rent.late", titleKey: "notifications.rentLate", priority: "HIGH", link: "/tenant/notifications", params: { recordId: r.id, month: r.billingMonth.toISOString().slice(0, 7), due: r.total.minus(r.paid).toFixed(2) } });
  }
}

/** "Rent invoice generated" for every bill of the month that the tenant has not been told about yet. */
export async function notifyInvoices(month: Date) {
  const rows = await db.rentRecord.findMany({ where: { billingMonth: month, agreement: { status: "ACTIVE" } }, select: { id: true, total: true, dueDate: true, agreement: { select: { tenantId: true } } }, take: 2000 });
  if (!rows.length) return 0;
  const tenantIds = [...new Set(rows.map((r) => r.agreement.tenantId))];
  const done = new Set((await db.notification.findMany({ where: { type: "rent.invoice", userId: { in: tenantIds } }, select: { params: true } })).map((n) => (n.params as { recordId?: string }).recordId));
  const fresh = rows.filter((r) => !done.has(r.id));
  if (!fresh.length) return 0;
  await db.notification.createMany({
    data: fresh.map((r) => ({ userId: r.agreement.tenantId, type: "rent.invoice", titleKey: "notifications.rentInvoice", link: "/tenant/notifications", params: { recordId: r.id, month: month.toISOString().slice(0, 7), total: r.total.toFixed(2), dueDate: r.dueDate.toISOString().slice(0, 10) } })),
  });
  return fresh.length;
}

export async function generateMonthlyRecords(month = monthStart()) {
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const agreements = await db.rentalAgreement.findMany({
    where: { status: "ACTIVE", startDate: { lte: monthEnd }, OR: [{ endDate: null }, { endDate: { gte: month } }] },
    select: { id: true, rent: true, unit: { select: { utilityCharge: true } } },
  });
  const created = await db.$transaction((tx) => ensureRentRecords(tx, agreements, month));
  await notifyInvoices(month);
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
      const ctx = await rentContext(tx, recordId);
      await notify([rec.agreement.ownerId], {
        type: "rent.received", titleKey: "notifications.rentReceived", link: "/home-owner/rent",
        params: { tenantName: ctx.tenantName, unit: ctx.unit, property: ctx.property, amount: amount.toFixed(2), method: input.method, receipt: receiptNumber(payment.id, ctx.billingMonth), paymentId: payment.id, verified: !!input.verified },
      }, tx);
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
    db.user.findUnique({ where: { id: a.tenantId }, select: { id: true, fullName: true, username: true, phone: true, avatarKey: true } }),
  ]);
  // the landlord gets the tenant's phone and photo for "Call / Message Tenant"; the tenant already knows their own
  const ownerSide = actor.role === "OWNER" || actor.role === "SUPER_ADMIN";
  const avatarUrl = ownerSide && tenant?.avatarKey ? await signStorageKey(tenant.avatarKey, 3600).then((r) => r.url).catch(() => null) : null;
  const month = p.rentRecord.billingMonth.toISOString().slice(0, 7);
  return {
    receiptNo: receiptNumber(p.id, p.rentRecord.billingMonth),
    issuedAt: p.paidAt, billingMonth: month,
    owner, tenant: tenant ? { id: tenant.id, fullName: tenant.fullName, username: tenant.username, phone: ownerSide ? tenant.phone : null, avatarUrl } : null,
    paymentId: p.id, status: p.status,
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
    params: { recordId, due: rec.total.minus(rec.paid).toFixed(2), month: rec.billingMonth.toISOString().slice(0, 7) },
  });
  return { sent: true };
}
