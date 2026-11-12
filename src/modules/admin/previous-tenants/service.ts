import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { rentStateOf, unpaidFor, type RentState } from "./logic";

/**
 * Super Admin → Previous Tenants: every finished tenancy (ended or terminated) on the platform, with the unpaid-rent state,
 * the reason for leaving and the landlord. One row per tenancy. Records deleted here stay in the database (hidden) when rent history depends on them.
 */
export const PAGE_SIZE = 10;
export const RENT_STATES = ["CLEARED", "DUE_1", "DUE_2", "DUE_3_PLUS"] as const;
export const LEAVE_REASONS = ["LEASE_EXPIRED", "POLICY_VIOLATION", "PURCHASED_HOME", "JOB_TRANSFER", "BUSINESS_CLOSED", "EVICTED", "UPGRADED_UNIT", "OTHER"] as const;
export type LeaveCode = (typeof LEAVE_REASONS)[number];

export const archiveListQuery = z.object({
  rent: z.enum(["all", ...RENT_STATES]).default("all"),
  reason: z.enum(["all", ...LEAVE_REASONS]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

export const recordSchema = z
  .object({ rentStatus: z.enum(RENT_STATES).optional(), reason: z.enum(LEAVE_REASONS).optional(), note: z.string().trim().max(300).optional() })
  .strict()
  .refine((v) => v.rentStatus !== undefined || v.reason !== undefined || v.note !== undefined, { message: "empty_update" });

const archived: Prisma.RentalAgreementWhereInput = { status: { in: ["ENDED", "TERMINATED"] }, adminHiddenAt: null };

/** Reason (a missing reason counts as "Other") and one search box over the tenant's name, e-mail, phone, Tenant ID and the property name. */
async function baseWhere(q: { reason: string; q?: string }): Promise<Prisma.RentalAgreementWhereInput> {
  const and: Prisma.RentalAgreementWhereInput[] = [archived];
  if (q.reason === "OTHER") and.push({ OR: [{ leaveReason: "OTHER" }, { leaveReason: null }] });
  else if (q.reason !== "all") and.push({ leaveReason: q.reason as never });
  const text = q.q?.trim();
  if (text) {
    const has = { contains: text, mode: "insensitive" as const };
    const people = await db.user.findMany({ where: { OR: [{ fullName: has }, { username: has }, { email: has }, { phone: { contains: text } }, { tenantCode: has }] }, select: { id: true }, take: 500 });
    and.push({ OR: [{ tenantId: { in: people.map((p) => p.id) } }, { unit: { property: { name: has } } }] });
  }
  return { AND: and };
}

/** Months with rent still owed, and the money, for each agreement (one query per 5000 agreements). */
async function ledger(ids: string[]) {
  const out = new Map<string, { months: number; balance: number }>();
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const g = await db.rentRecord.groupBy({ by: ["agreementId"], where: { agreementId: { in: chunk }, status: { in: ["DUE", "PARTIAL", "OVERDUE"] } }, _count: { _all: true }, _sum: { total: true, paid: true } });
    for (const x of g) out.set(x.agreementId, { months: x._count._all, balance: Math.max(0, Number(x._sum.total ?? 0) - Number(x._sum.paid ?? 0)) });
  }
  return out;
}

const stateOf = (override: string | null, months: number): RentState => (override && (RENT_STATES as readonly string[]).includes(override) ? (override as RentState) : rentStateOf(months));

/** The numbers on top: everything archived, who still owes rent (and how much), the average stay, and the last 30 days. */
export async function archiveStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const rows = await db.rentalAgreement.findMany({ where: archived, select: { id: true, rent: true, clearanceStatus: true, startDate: true, endDate: true } });
  const led = await ledger(rows.map((r) => r.id));
  const since = Date.now() - 30 * 86_400_000;
  let unpaid = 0, unpaidAmount = 0, years = 0, withDates = 0, recent = 0;
  for (const r of rows) {
    const l = led.get(r.id) ?? { months: 0, balance: 0 };
    const st = stateOf(r.clearanceStatus, l.months);
    if (st !== "CLEARED") { unpaid++; unpaidAmount += unpaidFor(st, l.balance, Number(r.rent), r.clearanceStatus !== null); }
    if (r.endDate) {
      const span = (r.endDate.getTime() - r.startDate.getTime()) / (365.25 * 86_400_000);
      if (span >= 0) { years += span; withDates++; }
      if (r.endDate.getTime() >= since) recent++;
    }
  }
  return {
    total: rows.length, unpaid, cleared: rows.length - unpaid, unpaidAmount: Math.round(unpaidAmount * 100) / 100,
    avgYears: withDates ? Math.round((years / withDates) * 10) / 10 : 0, movedOutRecently: recent,
  };
}

const personCard = { id: true, fullName: true, tenantCode: true, email: true, phone: true, avatarKey: true } as const;

/** Rows of the table, most recent move-out first, 10 per page. */
export async function archiveList(actor: Actor, q: z.infer<typeof archiveListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const where = await baseWhere(q);
  const ids = await db.rentalAgreement.findMany({ where, orderBy: [{ endDate: { sort: "desc", nulls: "last" } }, { id: "desc" }], take: 20_000, select: { id: true, rent: true, clearanceStatus: true } });
  const led = await ledger(ids.map((r) => r.id));
  const calc = new Map(ids.map((r) => {
    const l = led.get(r.id) ?? { months: 0, balance: 0 };
    const st = stateOf(r.clearanceStatus, l.months);
    return [r.id, { state: st, unpaid: st === "CLEARED" ? 0 : unpaidFor(st, l.balance, Number(r.rent), r.clearanceStatus !== null) }] as const;
  }));
  const matching = q.rent === "all" ? ids : ids.filter((r) => calc.get(r.id)!.state === q.rent);
  const pageIds = matching.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE).map((r) => r.id);
  const rows = await db.rentalAgreement.findMany({
    where: { id: { in: pageIds } },
    select: { id: true, tenantId: true, ownerId: true, startDate: true, endDate: true, updatedAt: true, status: true, leaveReason: true, adminNote: true, unit: { select: { unitNumber: true, property: { select: { id: true, name: true } } } } },
  });
  const users = await db.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.tenantId, r.ownerId]) } }, select: { ...personCard, ownerCode: true } });
  const avatars = await signStorageKeys(users.flatMap((u) => (u.avatarKey ? [u.avatarKey] : [])), 3600);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = pageIds.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const t = users.find((u) => u.id === r.tenantId), o = users.find((u) => u.id === r.ownerId);
    const c = calc.get(id)!;
    return [{
      id, status: r.status, startDate: r.startDate, moveOutAt: r.endDate ?? r.updatedAt, reasonCode: (r.leaveReason ?? "OTHER") as LeaveCode, note: r.adminNote,
      rentStatus: c.state, unpaid: c.unpaid.toString(),
      tenant: { id: r.tenantId, fullName: t?.fullName ?? "", tenantCode: t?.tenantCode ?? null, email: t?.email ?? null, phone: t?.phone ?? null, avatarUrl: t?.avatarKey ? avatars.get(t.avatarKey) ?? null : null },
      residence: { property: r.unit.property.name, unit: r.unit.unitNumber, landlord: o?.fullName ?? "", ownerCode: o?.ownerCode ?? null },
    }];
  });
  return { items, total: matching.length, page: q.page, pageSize: PAGE_SIZE };
}

/** Everything the View / Edit / Delete windows show: the tenant, the last residence with the landlord, and the month-by-month rent ledger. */
export async function archiveDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const a = await db.rentalAgreement.findFirst({
    where: { AND: [archived, { id }] },
    select: {
      id: true, tenantId: true, ownerId: true, rent: true, deposit: true, startDate: true, endDate: true, updatedAt: true, status: true, leaveReason: true, behavior: true, adminNote: true, clearanceStatus: true, members: true, settlementAmount: true,
      unit: { select: { unitNumber: true, floor: true, property: { select: { id: true, name: true, locationText: true, address: { select: { upazila: true, district: true } } } } } },
    },
  });
  if (!a) throw new AppError("NOT_FOUND");
  const [tenant, landlord, records, logs] = await Promise.all([
    db.user.findUnique({ where: { id: a.tenantId }, select: { ...personCard, username: true, occupation: true, nidLast4: true, verificationStatus: true, status: true, createdAt: true } }),
    db.user.findUnique({ where: { id: a.ownerId }, select: { id: true, fullName: true, ownerCode: true, email: true, phone: true } }),
    db.rentRecord.findMany({ where: { agreementId: id }, orderBy: { billingMonth: "asc" }, select: { id: true, billingMonth: true, total: true, paid: true, status: true } }),
    db.auditLog.findMany({ where: { resourceType: "RentalAgreement", resourceId: id, action: { startsWith: "past_tenant." } }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const open = records.filter((r) => r.status !== "PAID");
  const derivedBalance = Math.max(0, open.reduce((s, r) => s + Number(r.total) - Number(r.paid), 0));
  const state = stateOf(a.clearanceStatus, open.length);
  const unpaid = state === "CLEARED" ? 0 : unpaidFor(state, derivedBalance, Number(a.rent), a.clearanceStatus !== null);
  const admins = await db.user.findMany({ where: { id: { in: logs.flatMap((l) => (l.actorId ? [l.actorId] : [])) } }, select: { id: true, fullName: true } });
  const avatarUrl = tenant?.avatarKey ? await signStorageKey(tenant.avatarKey, 3600).then((s) => s.url).catch(() => null) : null;
  const p = a.unit.property;
  return {
    id: a.id, status: a.status, startDate: a.startDate, moveOutAt: a.endDate ?? a.updatedAt, members: a.members, rent: a.rent.toString(), deposit: a.deposit.toString(), settlement: a.settlementAmount?.toString() ?? null,
    reasonCode: (a.leaveReason ?? "OTHER") as LeaveCode, behavior: a.behavior, note: a.adminNote, rentStatus: state, derivedStatus: rentStateOf(open.length), overridden: a.clearanceStatus !== null, unpaid: unpaid.toString(), openMonths: open.length,
    tenant: tenant ? { id: tenant.id, fullName: tenant.fullName, username: tenant.username, tenantCode: tenant.tenantCode, email: tenant.email, phone: tenant.phone, occupation: tenant.occupation, nid: tenant.nidLast4 ? `•••••••••${tenant.nidLast4}` : null, verification: tenant.verificationStatus, accountStatus: tenant.status, joined: tenant.createdAt, avatarUrl } : null,
    residence: { property: p.name, unit: a.unit.unitNumber, floor: a.unit.floor, location: p.locationText || [p.address?.upazila, p.address?.district].filter(Boolean).join(", ") },
    landlord, ledger: records.map((r) => ({ id: r.id, month: r.billingMonth, total: r.total.toString(), paid: r.paid.toString(), status: r.status })),
    history: logs.map((l) => {
      const after = (l.after ?? {}) as Record<string, unknown>;
      return { id: l.id, action: l.action, at: l.createdAt, by: admins.find((x) => x.id === l.actorId)?.fullName ?? null, rentStatus: typeof after.rentStatus === "string" ? after.rentStatus : null, reason: typeof after.reason === "string" ? after.reason : null };
    }),
  };
}

/** Edit rent status & reason: the Super Admin's ruling on the unpaid rent and the reason for leaving. A ruling equal to what the ledger says is dropped. */
export async function setRecord(actor: Actor, id: string, input: z.infer<typeof recordSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const a = await db.rentalAgreement.findFirst({ where: { AND: [archived, { id }] }, select: { id: true, leaveReason: true, clearanceStatus: true, adminNote: true } });
  if (!a) throw new AppError("NOT_FOUND");
  const open = await db.rentRecord.count({ where: { agreementId: id, status: { in: ["DUE", "PARTIAL", "OVERDUE"] } } });
  const derived = rentStateOf(open);
  const data: Prisma.RentalAgreementUpdateInput = {};
  const before = { rentStatus: stateOf(a.clearanceStatus, open), reason: a.leaveReason ?? "OTHER" };
  if (input.rentStatus !== undefined) data.clearanceStatus = input.rentStatus === derived ? null : input.rentStatus;
  if (input.reason !== undefined) data.leaveReason = input.reason;
  if (input.note !== undefined) data.adminNote = input.note || null;
  const after = { rentStatus: input.rentStatus ?? before.rentStatus, reason: input.reason ?? before.reason };
  const changed = after.rentStatus !== before.rentStatus || after.reason !== before.reason || (input.note !== undefined && (input.note || null) !== a.adminNote);
  if (!changed) return { id, rentStatus: before.rentStatus, changed: false as const };
  await db.$transaction(async (tx) => {
    await tx.rentalAgreement.update({ where: { id }, data });
    await writeAudit({ actor, action: "past_tenant.update", resourceType: "RentalAgreement", resourceId: id, before, after, req }, tx);
  });
  return { id, rentStatus: after.rentStatus as RentState, changed: true as const };
}

/**
 * Delete from the archive. A tenancy nothing depends on is erased for good. One with rent records or maintenance tickets stays as a hidden
 * record (gone from every list) so the money trail is never broken.
 */
export async function archiveDelete(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const a = await db.rentalAgreement.findFirst({ where: { AND: [archived, { id }] }, select: { id: true, tenantId: true, ownerId: true } });
  if (!a) throw new AppError("NOT_FOUND");
  try {
    await db.$transaction(async (tx) => {
      await tx.rentalAgreement.delete({ where: { id } });
      await writeAudit({ actor, action: "past_tenant.purge", resourceType: "RentalAgreement", resourceId: id, before: { tenantId: a.tenantId, ownerId: a.ownerId }, after: { purged: true }, req }, tx);
    });
    return { id, purged: true as const };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2003") throw e;
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.rentalAgreement.update({ where: { id }, data: { adminHiddenAt: now, historyHiddenAt: now } });
    await writeAudit({ actor, action: "past_tenant.delete", resourceType: "RentalAgreement", resourceId: id, after: { hidden: true }, req }, tx);
  });
  return { id, purged: false as const };
}
