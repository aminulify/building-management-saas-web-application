import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { authorize, requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey } from "@/modules/uploads/service";
import type { tenantDirectoryQuery } from "./schema";

const DAY = 86_400_000;
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

/**
 * Tenants Directory (owner): every ACTIVE tenancy with the tenant's contact details, plus the three
 * headline numbers. Status shown: OVERDUE (an unpaid overdue rent record) > NOTICE_GIVEN > ACTIVE.
 * "Leave soon" = lease ends within the next 30 days.
 */
export async function tenantDirectory(actor: Actor, q: z.infer<typeof tenantDirectoryQuery>) {
  requireRole(actor, "OWNER");
  await authorize(actor, "tenancy:read", { ownerId: actor.id, tenantId: actor.id, readOnly: true });

  const start = today();
  const soon = new Date(start.getTime() + 30 * DAY);
  const base: Prisma.RentalAgreementWhereInput = { ownerId: actor.id, status: "ACTIVE", unit: { archivedAt: null } };
  const overdue: Prisma.RentalAgreementWhereInput = { rentRecords: { some: { status: "OVERDUE" } } };
  const leaveSoon: Prisma.RentalAgreementWhereInput = { endDate: { gte: start, lte: soon } };

  let search: Prisma.RentalAgreementWhereInput = {};
  if (q.q) {
    const people = await db.user.findMany({
      where: { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] },
      select: { id: true }, take: 200,
    });
    search = { OR: [{ tenantId: { in: people.map((p) => p.id) } }, { unit: { unitNumber: { contains: q.q, mode: "insensitive" } } }, { unit: { property: { name: { contains: q.q, mode: "insensitive" } } } }] };
  }
  const where: Prisma.RentalAgreementWhereInput = { AND: [base, search, q.tab === "overdue" ? overdue : q.tab === "leaveSoon" ? leaveSoon : {}] };

  const [total, active, overdueCount, leaveSoonCount, joined, rows] = await Promise.all([
    db.rentalAgreement.count({ where }),
    db.rentalAgreement.count({ where: base }),
    db.rentalAgreement.count({ where: { AND: [base, overdue] } }),
    db.rentalAgreement.count({ where: { AND: [base, leaveSoon] } }),
    db.rentalAgreement.count({ where: { AND: [base, { createdAt: { gte: new Date(Date.now() - 30 * DAY) } }] } }),
    db.rentalAgreement.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      include: { unit: { select: { id: true, unitNumber: true, rent: true, property: { select: { id: true, name: true } } } } },
    }),
  ]);

  const [people, owed] = await Promise.all([
    db.user.findMany({ where: { id: { in: rows.map((r) => r.tenantId) } }, select: { id: true, fullName: true, email: true, phone: true, avatarKey: true } }),
    db.rentRecord.findMany({ where: { agreementId: { in: rows.map((r) => r.id) }, status: "OVERDUE" }, select: { agreementId: true, total: true, paid: true } }),
  ]);
  const person = new Map(people.map((p) => [p.id, p]));
  const owedBy = new Map<string, number>();
  for (const r of owed) owedBy.set(r.agreementId, (owedBy.get(r.agreementId) ?? 0) + Number(r.total) - Number(r.paid));

  const items = await Promise.all(
    rows.map(async (r) => {
      const t = person.get(r.tenantId);
      const isOverdue = owedBy.has(r.id);
      return {
        id: r.id, unit: { id: r.unit.id, unitNumber: r.unit.unitNumber, rent: r.unit.rent.toFixed(2) }, property: r.unit.property,
        startDate: r.startDate, endDate: r.endDate, members: r.members, rent: r.rent.toFixed(2), deposit: r.deposit.toFixed(2),
        noticeGivenAt: r.noticeGivenAt, createdAt: r.createdAt,
        status: isOverdue ? ("OVERDUE" as const) : r.noticeGivenAt ? ("NOTICE_GIVEN" as const) : ("ACTIVE" as const),
        overdueAmount: isOverdue ? (owedBy.get(r.id) ?? 0).toFixed(2) : null,
        leaveSoon: !!r.endDate && r.endDate >= start && r.endDate <= soon,
        tenant: t ? { id: t.id, fullName: t.fullName, email: t.email, phone: t.phone, avatarUrl: t.avatarKey ? await signStorageKey(t.avatarKey, 3600).then((s) => s.url).catch(() => null) : null } : null,
      };
    }),
  );

  return { items, total, page: q.page, pageSize: q.pageSize, stats: { active, leaveSoon: leaveSoonCount, overdue: overdueCount, joinedLast30Days: joined } };
}
