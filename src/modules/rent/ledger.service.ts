import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, requireRole } from "@/lib/authz/authorize";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { monthStart } from "./billing";
import type { ledgerQuery, reportQuery, remindAllSchema } from "./schema";

type Money = Prisma.Decimal;
const num = (d: Money) => Number(d);
const fix = (n: number) => n.toFixed(2);
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

export type LedgerStatus = "PAID" | "UNPAID" | "OVERDUE";

interface Scope { month?: string; propertyId?: string }

/**
 * Every rent record the owner sees for one month (optionally one property). In the CURRENT month the list also
 * carries over rent from earlier months that is still overdue, so unpaid arrears are never hidden.
 */
async function loadRows(actor: Actor, scope: Scope) {
  requireRole(actor, "OWNER");
  await authorize(actor, "rent:record", { ownerId: actor.id });
  const m = monthStart(scope.month);
  const isCurrent = m.getTime() === monthStart().getTime();
  const records = await db.rentRecord.findMany({
    where: {
      agreement: { ownerId: actor.id, ...(scope.propertyId ? { unit: { propertyId: scope.propertyId } } : {}) },
      OR: [{ billingMonth: m }, ...(isCurrent ? [{ billingMonth: { lt: m }, status: "OVERDUE" as const }] : [])],
    },
    select: {
      id: true, billingMonth: true, dueDate: true, total: true, paid: true, status: true,
      agreement: { select: { id: true, status: true, tenantId: true, unit: { select: { unitNumber: true, property: { select: { id: true, name: true } } } } } },
      payments: { where: { status: "VERIFIED" }, orderBy: { paidAt: "desc" }, select: { id: true, paidAt: true } },
    },
  });
  const tenants = new Map((await db.user.findMany({ where: { id: { in: records.map((r) => r.agreement.tenantId) } }, select: { id: true, fullName: true, phone: true } })).map((t) => [t.id, t]));
  const now = today();

  const rows = records.flatMap((r) => {
    const outstanding = Math.max(0, num(r.total) - num(r.paid));
    const t = tenants.get(r.agreement.tenantId);
    const pastDue = outstanding > 0 && r.dueDate < now;
    const status: LedgerStatus = outstanding <= 0 ? "PAID" : r.status === "OVERDUE" || pastDue ? "OVERDUE" : "UNPAID";
    // a tenancy that has ended no longer owes rent that is not yet due (but keeps any arrears or part-payments)
    if (r.agreement.status !== "ACTIVE" && status === "UNPAID" && num(r.paid) === 0) return [];
    return [{
      recordId: r.id, agreementId: r.agreement.id, tenantId: r.agreement.tenantId,
      tenant: t?.fullName ?? null, tenantPhone: t?.phone ?? null,
      unit: r.agreement.unit.unitNumber, property: r.agreement.unit.property.name, propertyId: r.agreement.unit.property.id,
      billingMonth: r.billingMonth.toISOString().slice(0, 7), carriedOver: r.billingMonth < m,
      dueDate: r.dueDate, total: fix(num(r.total)), paid: fix(num(r.paid)), outstanding: fix(outstanding),
      status, partial: status !== "PAID" && num(r.paid) > 0,
      paidAt: r.payments[0]?.paidAt ?? null, receiptPaymentId: r.payments[0]?.id ?? null, pastDue,
    }];
  });
  return { month: m.toISOString().slice(0, 7), rows };
}

type Row = Awaited<ReturnType<typeof loadRows>>["rows"][number];

function summarize(rows: Row[]) {
  const own = rows.filter((r) => !r.carriedOver);
  const sum = (list: Row[], k: "total" | "paid" | "outstanding") => list.reduce((s, r) => s + Number(r[k]), 0);
  const unpaid = rows.filter((r) => r.status !== "PAID");
  const overdue = rows.filter((r) => r.status === "OVERDUE");
  const pending = own.filter((r) => r.status === "UNPAID");
  const remindable = rows.filter((r) => r.status !== "PAID" && r.pastDue);
  const expected = sum(own, "total");
  const collected = sum(own, "paid");
  return {
    expected: fix(expected), collected: fix(collected), pending: fix(sum(pending, "outstanding")),
    overdueCount: overdue.length, overdueAmount: fix(sum(overdue, "outstanding")),
    dueAmount: fix(sum(unpaid, "outstanding")), unpaidCount: unpaid.length,
    collectionRate: expected > 0 ? Number(((collected * 100) / expected).toFixed(1)) : 0,
    records: own.length,
    remindable: { count: remindable.length, tenants: new Set(remindable.map((r) => r.tenantId)).size, amount: fix(sum(remindable, "outstanding")) },
  };
}

const PRIORITY: Record<LedgerStatus, number> = { OVERDUE: 0, UNPAID: 1, PAID: 2 };
const naturalOrder = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
const sortRows = (rows: Row[]) => rows.sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || naturalOrder(a.property, b.property) || naturalOrder(a.unit, b.unit));

function filterRows(rows: Row[], q: { status: "all" | "paid" | "unpaid"; q?: string }) {
  const needle = q.q?.toLowerCase();
  return rows.filter(
    (r) =>
      (q.status === "all" || (q.status === "paid" ? r.status === "PAID" : r.status !== "PAID")) &&
      (!needle || r.unit.toLowerCase().includes(needle) || (r.tenant ?? "").toLowerCase().includes(needle) || r.property.toLowerCase().includes(needle)),
  );
}

/** Rent Overview page: headline numbers for the period + one page of the Payment History table. */
export async function ownerLedger(actor: Actor, q: z.infer<typeof ledgerQuery>) {
  const { month, rows } = await loadRows(actor, q);
  const filtered = sortRows(filterRows(rows, q));
  const items = filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  return { month, propertyId: q.propertyId ?? null, stats: summarize(rows), items, total: filtered.length, page: q.page, pageSize: q.pageSize };
}

/** Everything the "Export Report" PDF needs, for the same filters as the screen. */
export async function ownerReport(actor: Actor, q: z.infer<typeof reportQuery>) {
  const { month, rows } = await loadRows(actor, q);
  const filtered = sortRows(filterRows(rows, q));
  if (filtered.length > 2000) throw new AppError("VALIDATION_ERROR", [{ path: "month", code: "too_many_rows", max: 2000 }]);
  const [owner, property] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true, ownerCode: true } }),
    q.propertyId ? db.property.findFirst({ where: { id: q.propertyId, ownerId: actor.id }, select: { name: true } }) : null,
  ]);
  return {
    generatedAt: new Date().toISOString(), owner, month, property: property?.name ?? null, status: q.status, search: q.q ?? null,
    stats: summarize(rows), rows: filtered,
  };
}

/**
 * "Send Reminder": every tenant with unpaid rent whose due date has passed gets an in-app notification and an SMS
 * (queued in the outbox for the SMS gateway). A tenant reminded in the last 24 hours is skipped, so the button
 * can never spam anyone.
 */
export async function remindAll(actor: Actor, input: z.infer<typeof remindAllSchema>, req: Request) {
  const { month, rows } = await loadRows(actor, input);
  rateLimit(`remind-all:${actor.id}`, 6, 3600_000);
  const eligible = rows.filter((r) => r.status !== "PAID" && r.pastDue);
  const tenantIds = [...new Set(eligible.map((r) => r.tenantId))];
  const recent = new Set(
    (await db.notification.findMany({ where: { userId: { in: tenantIds }, type: "rent.reminder", createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } }, select: { userId: true } })).map((n) => n.userId),
  );
  const toSend = eligible.filter((r) => !recent.has(r.tenantId));
  const skippedRecent = tenantIds.filter((id) => recent.has(id)).length;
  // one reminder per tenant, covering everything they owe in the list
  const owed = new Map<string, { due: number; months: string[]; phone: string | null; unit: string }>();
  for (const r of toSend) {
    const cur = owed.get(r.tenantId) ?? { due: 0, months: [], phone: r.tenantPhone, unit: r.unit };
    cur.due += Number(r.outstanding);
    if (!cur.months.includes(r.billingMonth)) cur.months.push(r.billingMonth);
    owed.set(r.tenantId, cur);
  }

  await db.$transaction(async (tx) => {
    if (owed.size) {
      await tx.notification.createMany({
        data: [...owed.entries()].map(([userId, o]) => ({
          userId, type: "rent.reminder", titleKey: "notifications.rentReminder", priority: "HIGH" as const,
          params: { due: fix(o.due), month: o.months.sort().join(", ") }, link: "/tenant/notifications",
        })),
      });
      await tx.outboxEvent.createMany({
        data: [...owed.entries()].filter(([, o]) => o.phone).map(([userId, o]) => ({ type: "sms.send", payload: { userId, phone: o.phone, template: "rent.reminder", params: { due: fix(o.due), month: o.months.sort().join(", "), unit: o.unit } } })),
      });
    }
    await writeAudit({ actor, action: "rent.remind_all", resourceType: "RentRecord", after: { month, propertyId: input.propertyId ?? null, sent: owed.size, skippedRecent, eligible: tenantIds.length }, req }, tx);
  }, { timeout: 30_000, maxWait: 10_000 });

  return { sent: owed.size, skippedRecent, eligible: tenantIds.length, smsQueued: [...owed.values()].filter((o) => o.phone).length };
}
