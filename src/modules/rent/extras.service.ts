import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { toCsv } from "@/lib/csv";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import { computeStatus, monthStart } from "./billing";
import { monthParam } from "./schema";

export const paymentsListQuery = z.object({
  month: monthParam.optional(),
  method: z.enum(["CASH", "BKASH", "NAGAD", "ROCKET", "BANK", "CARD"]).optional(),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
});

const pay = {
  id: true, amount: true, method: true, reference: true, paidAt: true, status: true,
  rentRecord: { select: { billingMonth: true, agreement: { select: { tenantId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } } },
} as const;

const monthRange = (m?: string) => (m ? { gte: monthStart(m), lt: new Date(Date.UTC(monthStart(m).getUTCFullYear(), monthStart(m).getUTCMonth() + 1, 1)) } : undefined);

/** Owner "Payment History": every payment on the owner's agreements. */
export async function ownerPayments(actor: Actor, q: z.infer<typeof paymentsListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "rent:record", { ownerId: actor.id });
  const rows = await db.rentPayment.findMany({
    where: { method: q.method, status: q.status, rentRecord: { agreement: { ownerId: actor.id }, billingMonth: monthRange(q.month) } },
    select: pay, ...pageArgs(page),
  });
  const tenants = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.rentRecord.agreement.tenantId) } }, select: { id: true, fullName: true } })).map((t) => [t.id, t.fullName]));
  return pageResult(rows.map((r) => ({ ...r, tenant: tenants.get(r.rentRecord.agreement.tenantId) ?? null })), page.limit);
}

/** Tenant "Payment History": own payments only. */
export async function tenantPayments(actor: Actor, q: z.infer<typeof paymentsListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "rent:pay", { ownerId: actor.id });
  const rows = await db.rentPayment.findMany({
    where: { method: q.method, status: q.status, rentRecord: { agreement: { tenantId: actor.id }, billingMonth: monthRange(q.month) } },
    select: pay, ...pageArgs(page),
  });
  return pageResult(rows.map(({ rentRecord, ...r }) => ({ ...r, billingMonth: rentRecord.billingMonth, unit: rentRecord.agreement.unit })), page.limit);
}

/** Month report for the owner: one row per tenant record (Export Report). */
export async function exportMonth(actor: Actor, month: string) {
  await authorize(actor, "rent:record", { ownerId: actor.id });
  const rows = await db.rentRecord.findMany({
    where: { billingMonth: monthStart(month), agreement: { ownerId: actor.id } },
    select: { total: true, paid: true, dueDate: true, status: true, agreement: { select: { tenantId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } } },
  });
  const tenants = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.agreement.tenantId) } }, select: { id: true, fullName: true } })).map((t) => [t.id, t.fullName]));
  return toCsv(rows.map((r) => ({ month, property: r.agreement.unit.property.name, unit: r.agreement.unit.unitNumber, tenant: tenants.get(r.agreement.tenantId) ?? "", total: r.total.toFixed(2), paid: r.paid.toFixed(2), outstanding: r.total.minus(r.paid).toFixed(2), dueDate: r.dueDate, status: r.status })));
}

export const verifySchema = z.object({ decision: z.enum(["VERIFIED", "REJECTED"]) });

/** Digital payments recorded as unconfirmed (PENDING) only count toward the balance once the owner verifies them. */
export async function verifyPayment(actor: Actor, id: string, decision: "VERIFIED" | "REJECTED", req: Request) {
  const p = await db.rentPayment.findUnique({ where: { id }, include: { rentRecord: { include: { agreement: true } } } });
  if (!p) throw new AppError("NOT_FOUND");
  await authorize(actor, "rent:record", { ownerId: p.rentRecord.agreement.ownerId });
  if (p.status !== "PENDING") throw new AppError("INVALID_STATE", { from: p.status });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RentRecord" WHERE id = ${p.rentRecordId}::uuid FOR UPDATE`;
    const rec = await tx.rentRecord.findUniqueOrThrow({ where: { id: p.rentRecordId } });
    if (decision === "VERIFIED" && rec.paid.plus(p.amount).gt(rec.total)) throw new AppError("VALIDATION_ERROR", [{ path: "amount", code: "exceeds_balance", max: rec.total.minus(rec.paid).toFixed(2) }]);
    const payment = await tx.rentPayment.update({ where: { id }, data: { status: decision } });
    let record = rec;
    if (decision === "VERIFIED") {
      const paid = rec.paid.plus(p.amount);
      record = await tx.rentRecord.update({ where: { id: rec.id }, data: { paid, status: computeStatus(rec.total, paid, rec.dueDate) } });
    }
    await notify([p.rentRecord.agreement.tenantId], { type: "rent.verified", titleKey: "notifications.rentPaymentVerified", params: { decision, amount: new Prisma.Decimal(p.amount).toFixed(2) } }, tx);
    await writeAudit({ actor, action: `rent.payment_${decision.toLowerCase()}`, resourceType: "RentPayment", resourceId: id, after: { decision }, req }, tx);
    return { payment, record };
  });
}

export const adjustSchema = z.object({ other: z.coerce.number().min(0).max(1_000_000).multipleOf(0.01) });

/** Owner adds extra charges (repairs, penalty…) to an unpaid monthly bill; total is recalculated server-side. */
export async function adjustRecord(actor: Actor, id: string, other: number, req: Request) {
  const rec = await db.rentRecord.findUnique({ where: { id }, include: { agreement: true } });
  if (!rec) throw new AppError("NOT_FOUND");
  await authorize(actor, "rent:record", { ownerId: rec.agreement.ownerId });
  if (rec.status === "PAID") throw new AppError("INVALID_STATE", { from: rec.status });
  const total = rec.rent.plus(rec.utility).plus(other);
  if (total.lt(rec.paid)) throw new AppError("VALIDATION_ERROR", [{ path: "other", code: "total_below_paid" }]);
  return db.$transaction(async (tx) => {
    const out = await tx.rentRecord.update({ where: { id }, data: { other, total, status: computeStatus(total, rec.paid, rec.dueDate) } });
    await notify([rec.agreement.tenantId], { type: "rent.adjusted", titleKey: "notifications.rentAdjusted", params: { total: total.toFixed(2) } }, tx);
    await writeAudit({ actor, action: "rent.adjust", resourceType: "RentRecord", resourceId: id, before: { other: rec.other.toFixed(2) }, after: { other }, req }, tx);
    return out;
  });
}
