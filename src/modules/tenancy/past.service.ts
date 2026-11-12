import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey } from "@/modules/uploads/service";
import { ledgerStatus, ledgerSummary, maskNid } from "./past-ledger";
import type { pastRecordSchema, pastTenantsQuery } from "./schema";

const avatar = (key: string | null) => (key ? signStorageKey(key, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null));
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

/** Finished tenancies (ended or terminated) of this owner that have not been removed from the history. */
const past = (ownerId: string): Prisma.RentalAgreementWhereInput => ({ ownerId, status: { in: ["ENDED", "TERMINATED"] }, historyHiddenAt: null, adminHiddenAt: null });

/** Previous Tenants: past tenancies with tenant, property and unit, the reason for leaving and the owner's rating. */
export async function listPastTenants(actor: Actor, q: z.infer<typeof pastTenantsQuery>) {
  requireRole(actor, "OWNER");
  await authorize(actor, "tenancy:read", { ownerId: actor.id, tenantId: actor.id, readOnly: true });

  const and: Prisma.RentalAgreementWhereInput[] = [past(actor.id)];
  if (q.propertyId) and.push({ unit: { propertyId: q.propertyId } });
  if (q.behavior) and.push({ behavior: q.behavior === "UNRATED" ? null : q.behavior });
  if (q.q) {
    const people = await db.user.findMany({ where: { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] }, select: { id: true }, take: 200 });
    and.push({ tenantId: { in: people.map((p) => p.id) } });
  }
  const where: Prisma.RentalAgreementWhereInput = { AND: and };

  const [total, all, rows] = await Promise.all([
    db.rentalAgreement.count({ where }),
    db.rentalAgreement.count({ where: past(actor.id) }),
    db.rentalAgreement.findMany({
      where, orderBy: [{ endDate: { sort: "desc", nulls: "last" } }, { id: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      include: { unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } } },
    }),
  ]);
  const people = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.tenantId) } }, select: { id: true, fullName: true, phone: true, avatarKey: true } })).map((u) => [u.id, u]));

  const items = await Promise.all(rows.map(async (r) => {
    const t = people.get(r.tenantId);
    return {
      id: r.id, startDate: r.startDate, endDate: r.endDate, terminated: r.status === "TERMINATED", leaveReason: r.leaveReason, behavior: r.behavior, ownerNotes: r.ownerNotes,
      property: r.unit.property, unit: { id: r.unit.id, unitNumber: r.unit.unitNumber },
      tenant: t ? { id: t.id, fullName: t.fullName, phone: t.phone, avatarUrl: await avatar(t.avatarKey) } : null,
    };
  }));
  return { items, total, page: q.page, pageSize: q.pageSize, all };
}

async function loadPast(actor: Actor, id: string, mode: "read" | "manage") {
  const a = await db.rentalAgreement.findUnique({ where: { id }, include: { unit: { include: { property: { select: { id: true, name: true } } } } } });
  if (!a || a.historyHiddenAt) throw new AppError("NOT_FOUND");
  await authorize(actor, mode === "read" ? "tenancy:read" : "tenancy:manage", { ownerId: a.ownerId, tenantId: a.tenantId, readOnly: mode === "read" });
  if (a.ownerId !== actor.id) throw new AppError("NOT_FOUND");
  if (a.status !== "ENDED" && a.status !== "TERMINATED") throw new AppError("INVALID_STATE", { reason: "not_past" });
  return a;
}

/** Everything the history modal shows: profile, residency, month-by-month rent ledger and the money summary. */
export async function pastTenantDetail(actor: Actor, id: string) {
  requireRole(actor, "OWNER");
  const a = await loadPast(actor, id, "read");
  const [tenant, records, activeElsewhere, activeWithMe] = await Promise.all([
    db.user.findUnique({ where: { id: a.tenantId }, select: { id: true, fullName: true, phone: true, email: true, nidLast4: true, avatarKey: true } }),
    db.rentRecord.findMany({ where: { agreementId: id }, orderBy: { billingMonth: "asc" }, include: { payments: { where: { status: "VERIFIED" }, select: { amount: true, paidAt: true } } } }),
    db.rentalAgreement.count({ where: { tenantId: a.tenantId, status: "ACTIVE" } }),
    db.rentalAgreement.count({ where: { tenantId: a.tenantId, ownerId: actor.id, status: "ACTIVE" } }),
  ]);

  const ledger = records.map((r) => {
    const total = Number(r.total), paid = Number(r.paid);
    const status = ledgerStatus({ total, paid, dueDate: r.dueDate, payments: r.payments.map((p) => ({ amount: Number(p.amount), paidAt: p.paidAt })) });
    const paidAt = r.payments.reduce<Date | null>((m, p) => (!m || p.paidAt > m ? p.paidAt : m), null);
    return { id: r.id, billingMonth: r.billingMonth, dueDate: r.dueDate, total, paid, due: Math.max(0, total - paid), paidAt, status };
  });

  return {
    id: a.id, status: a.status, terminated: a.status === "TERMINATED",
    startDate: a.startDate, endDate: a.endDate, members: a.members, rent: Number(a.rent), deposit: Number(a.deposit), settlementAmount: a.settlementAmount ? Number(a.settlementAmount) : null,
    leaveReason: a.leaveReason, behavior: a.behavior, ownerNotes: a.ownerNotes,
    property: a.unit.property, unit: { id: a.unit.id, unitNumber: a.unit.unitNumber },
    tenant: tenant ? { id: tenant.id, fullName: tenant.fullName, phone: tenant.phone, email: tenant.email, nid: maskNid(tenant.nidLast4), avatarUrl: await avatar(tenant.avatarKey) } : null,
    ledger, summary: ledgerSummary(ledger),
    /** moving them into another unit is refused while they rent somewhere else; messaging follows the "current tenants only" rule */
    hasActiveTenancy: activeElsewhere > 0, canMessage: activeWithMe > 0,
  };
}

/** Owner edits reason, rating, lease dates and private notes of a past tenancy. Rent records stay untouched. */
export async function updatePastRecord(actor: Actor, id: string, input: z.infer<typeof pastRecordSchema>, req: Request) {
  requireRole(actor, "OWNER");
  const a = await loadPast(actor, id, "manage");
  const start = input.startDate ?? a.startDate;
  const end = input.endDate ?? a.endDate;
  const datesChanged = !!input.startDate || !!input.endDate; // a same-day tenancy can still get a rating or a note
  if (datesChanged && end && end <= start) throw new AppError("VALIDATION_ERROR", [{ path: "endDate", code: "end_after_start" }]);
  if (input.endDate && input.endDate > today()) throw new AppError("VALIDATION_ERROR", [{ path: "endDate", code: "not_in_future" }]);

  return db.$transaction(async (tx) => {
    const out = await tx.rentalAgreement.update({
      where: { id },
      data: { leaveReason: input.leaveReason, behavior: input.behavior, startDate: input.startDate, endDate: input.endDate, ownerNotes: input.ownerNotes },
      select: { id: true, startDate: true, endDate: true, leaveReason: true, behavior: true, ownerNotes: true },
    });
    await writeAudit({ actor, action: "tenancy.record.update", resourceType: "RentalAgreement", resourceId: id, before: { behavior: a.behavior, leaveReason: a.leaveReason }, after: { behavior: out.behavior, leaveReason: out.leaveReason }, req }, tx);
    return out;
  });
}

/** "Delete" a row: it leaves the history list, but the agreement and its rent records stay for the books. */
export async function removePastRecord(actor: Actor, id: string, req: Request) {
  requireRole(actor, "OWNER");
  await loadPast(actor, id, "manage");
  await db.$transaction(async (tx) => {
    await tx.rentalAgreement.update({ where: { id }, data: { historyHiddenAt: new Date() } });
    await writeAudit({ actor, action: "tenancy.record.hide", resourceType: "RentalAgreement", resourceId: id, req }, tx);
  });
  return { removed: true };
}
