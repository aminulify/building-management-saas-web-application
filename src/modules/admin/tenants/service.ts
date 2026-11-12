import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { dhakaToday } from "@/modules/dashboards/admin-range";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { DOC_KINDS, addressText, documentViews, reviewUserDocument, type DocKindName, type documentReviewSchema } from "../shared/document-review";

/** Super Admin → Active Tenants: every tenant with a running lease, the unit they live in and the owner they rent from. */

export const PAGE_SIZE = 10;
const DAY = 86_400_000;
const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
const todayUtc = () => dateOnly(dhakaToday());

/** A running lease: the agreement is Active and its unit still exists. */
const running: Prisma.RentalAgreementWhereInput = { status: "ACTIVE", unit: { archivedAt: null } };

export type TenantState = "ACTIVE" | "NOTICE_GIVEN";
export const tenantState = (a: { noticeGivenAt: Date | null }): TenantState => (a.noticeGivenAt ? "NOTICE_GIVEN" : "ACTIVE");

/** Three cards: all tenants, how many hold a running lease (and the share), and leases ending within 30 days. */
export async function tenantsStats(actor: Actor) {
  requireRole(actor, "SUPER_ADMIN");
  const start = todayUtc();
  const soon = new Date(start.getTime() + 30 * DAY);
  const [total, fresh, holders, expiring] = await Promise.all([
    db.user.count({ where: { role: "TENANT", archivedAt: null, status: "ACTIVE" } }),
    db.user.count({ where: { role: "TENANT", archivedAt: null, status: "ACTIVE", createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    db.rentalAgreement.groupBy({ by: ["tenantId"], where: running }),
    db.rentalAgreement.count({ where: { ...running, endDate: { gte: start, lte: soon } } }),
  ]);
  const activeLeases = holders.length;
  return { totalTenants: total, newLast30: fresh, activeLeases, activeRate: total === 0 ? 0 : Math.min(100, Math.round((activeLeases / total) * 1000) / 10), expiringSoon: expiring };
}

export const tenantsListQuery = z.object({
  tab: z.enum(["all", "active", "notice"]).default("all"),
  /** NID verification of the tenant: Verified, Pending (documents waiting), Rejected, Not Verified (nothing sent) */
  verification: z.enum(["all", "VERIFIED", "PENDING", "REJECTED", "UNVERIFIED"]).default("all"),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

export async function tenantsList(actor: Actor, q: z.infer<typeof tenantsListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const and: Prisma.RentalAgreementWhereInput[] = [running];
  if (q.tab === "active") and.push({ noticeGivenAt: null });
  if (q.tab === "notice") and.push({ noticeGivenAt: { not: null } });
  if (q.verification !== "all") {
    const ids = await db.user.findMany({ where: { role: "TENANT", verificationStatus: q.verification }, select: { id: true }, take: 20_000 });
    and.push({ tenantId: { in: ids.map((u) => u.id) } });
  }
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    const people = await db.user.findMany({ where: { OR: [{ fullName: has(q.q) }, { username: has(q.q) }, { email: has(q.q) }, { phone: { contains: q.q } }, { tenantCode: has(q.q) }, { ownerCode: has(q.q) }] }, select: { id: true }, take: 200 });
    const ids = people.map((p) => p.id);
    and.push({ OR: [{ tenantId: { in: ids } }, { ownerId: { in: ids } }, { unit: { unitNumber: has(q.q) } }, { unit: { property: { name: has(q.q) } } }] });
  }
  const where: Prisma.RentalAgreementWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.rentalAgreement.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, tenantId: true, ownerId: true, rent: true, endDate: true, noticeGivenAt: true, createdAt: true, unit: { select: { unitNumber: true, floor: true, property: { select: { id: true, name: true } } } } },
    }),
    db.rentalAgreement.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [r.tenantId, r.ownerId]))];
  const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true, phone: true, tenantCode: true, ownerCode: true, avatarKey: true, verificationStatus: true } })).map((u) => [u.id, u]));
  const avatars = await signStorageKeys([...users.values()].flatMap((u) => (u.avatarKey ? [u.avatarKey] : [])), 3600);
  const soon = todayUtc().getTime() + 30 * DAY, now = todayUtc().getTime();
  const items = rows.map((r) => {
    const t = users.get(r.tenantId), o = users.get(r.ownerId);
    return {
      id: r.id, state: tenantState(r), endDate: r.endDate, rent: r.rent.toString(), joined: r.createdAt,
      endingSoon: !!r.endDate && r.endDate.getTime() >= now && r.endDate.getTime() <= soon,
      tenant: { id: r.tenantId, fullName: t?.fullName ?? "", tenantCode: t?.tenantCode ?? null, email: t?.email ?? null, phone: t?.phone ?? null, avatarUrl: t?.avatarKey ? avatars.get(t.avatarKey) ?? null : null, verification: t?.verificationStatus ?? "UNVERIFIED" },
      residence: { property: r.unit.property.name, unit: r.unit.unitNumber, floor: r.unit.floor },
      owner: { id: r.ownerId, fullName: o?.fullName ?? "", ownerCode: o?.ownerCode ?? null, phone: o?.phone ?? null },
    };
  });
  return { items, total, page: q.page, pageSize: PAGE_SIZE };
}

const avatar = (key: string | null) => (key ? signStorageKey(key, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null));

/** Everything about one tenancy for the View and Edit windows: tenant, residence, rent, lease, NID status, owner, and the free units the tenant could move to. */
export async function tenantDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const a = await db.rentalAgreement.findFirst({
    where: { id, ...running },
    select: {
      id: true, tenantId: true, ownerId: true, rent: true, deposit: true, startDate: true, endDate: true, members: true, noticeGivenAt: true, createdAt: true, unitId: true,
      unit: { select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, property: { select: { id: true, name: true, type: true, locationText: true, address: { select: { upazila: true, district: true } } } } } },
    },
  });
  if (!a) throw new AppError("NOT_FOUND");
  const pick = { id: true, fullName: true, username: true, email: true, phone: true, tenantCode: true, ownerCode: true, avatarKey: true, verificationStatus: true, nid: true, nidLast4: true, dateOfBirth: true, gender: true, occupation: true, createdAt: true, lastSeenAt: true, address: { select: { division: true, district: true, upazila: true, union: true, street: true, postOffice: true } } } as const;
  const [users, free, records, docs, landlordCopy] = await Promise.all([
    db.user.findMany({ where: { id: { in: [a.tenantId, a.ownerId] } }, select: pick }),
    db.unit.findMany({
      where: { archivedAt: null, availability: "AVAILABLE", property: { ownerId: a.ownerId, archivedAt: null } }, orderBy: [{ propertyId: "asc" }, { floor: "asc" }, { unitNumber: "asc" }], take: 200,
      select: { id: true, unitNumber: true, floor: true, rent: true, property: { select: { name: true } } },
    }),
    db.rentRecord.findMany({ where: { agreementId: id }, select: { status: true, total: true, paid: true } }),
    db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: a.tenantId, kind: { in: [...DOC_KINDS] } }, orderBy: { id: "desc" }, select: { id: true, kind: true, status: true, notes: true, storageKey: true, createdAt: true } }),
    db.rentalAgreement.findUnique({ where: { id }, select: { agreementDocKey: true, updatedAt: true } }),
  ]);
  const t = users.find((u) => u.id === a.tenantId), o = users.find((u) => u.id === a.ownerId);
  const [tAvatar, oAvatar] = await Promise.all([avatar(t?.avatarKey ?? null), avatar(o?.avatarKey ?? null)]);
  const open = records.filter((r) => r.status !== "PAID");
  const documents = await documentViews(docs, landlordCopy);
  const p = a.unit.property;
  const location = [...new Set([p.locationText, p.address?.upazila, p.address?.district].filter(Boolean) as string[])].join(", ");
  return {
    id: a.id, state: tenantState(a), startDate: a.startDate, endDate: a.endDate, noticeGivenAt: a.noticeGivenAt, members: a.members, rent: a.rent.toString(), deposit: a.deposit.toString(), joined: a.createdAt,
    tenant: { id: a.tenantId, fullName: t?.fullName ?? "", username: t?.username ?? "", tenantCode: t?.tenantCode ?? null, email: t?.email ?? null, phone: t?.phone ?? null, occupation: t?.occupation ?? null, avatarUrl: tAvatar, verificationStatus: t?.verificationStatus ?? "UNVERIFIED", nid: t?.nid ?? null, nidLast4: t?.nidLast4 ?? null, dateOfBirth: t?.dateOfBirth ?? null, gender: t?.gender ?? null, address: addressText(t?.address), memberSince: t?.createdAt ?? null, lastSeenAt: t?.lastSeenAt ?? null },
    owner: { id: a.ownerId, fullName: o?.fullName ?? "", ownerCode: o?.ownerCode ?? null, email: o?.email ?? null, phone: o?.phone ?? null, avatarUrl: oAvatar },
    residence: { unitId: a.unit.id, unit: a.unit.unitNumber, floor: a.unit.floor, bedrooms: a.unit.bedrooms, bathrooms: a.unit.bathrooms, areaSqft: a.unit.areaSqft, property: p.name, propertyType: p.type, location },
    ledger: { records: records.length, open: open.length, overdue: records.filter((r) => r.status === "OVERDUE").length, due: open.reduce((s, r) => s + Number(r.total) - Number(r.paid), 0).toString() },
    documents,
    unitChoices: free.map((u) => ({ id: u.id, unit: u.unitNumber, floor: u.floor, property: u.property.name, rent: u.rent.toString() })),
  };
}

/** Edit window: move to another free unit, change the lease end date, or switch between Active and Notice Given. */
export const tenantEditSchema = z.object({
  unitId: z.string().uuid().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").refine((s) => !Number.isNaN(dateOnly(s).getTime()), "invalid_date").optional(),
  status: z.enum(["ACTIVE", "NOTICE_GIVEN"]).optional(),
}).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: "empty_update" });

export async function editTenant(actor: Actor, id: string, input: z.infer<typeof tenantEditSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const a = await tx.rentalAgreement.findFirst({ where: { id, ...running }, select: { id: true, tenantId: true, ownerId: true, unitId: true, startDate: true, endDate: true, noticeGivenAt: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } });
    if (!a) throw new AppError("NOT_FOUND");
    const data: Prisma.RentalAgreementUpdateInput = {};
    const changes: string[] = [];
    let place = { property: a.unit.property.name, unit: a.unit.unitNumber };

    if (input.endDate !== undefined) {
      const end = dateOnly(input.endDate);
      if (end.getTime() <= a.startDate.getTime()) throw new AppError("VALIDATION_ERROR", [{ path: "endDate", code: "end_after_start" }]);
      if (a.endDate?.getTime() !== end.getTime()) { data.endDate = end; changes.push("end"); }
    }
    if (input.status !== undefined && (input.status === "NOTICE_GIVEN") !== !!a.noticeGivenAt) {
      data.noticeGivenAt = input.status === "NOTICE_GIVEN" ? new Date() : null;
      changes.push(input.status === "NOTICE_GIVEN" ? "notice" : "active");
    }
    if (input.unitId !== undefined && input.unitId !== a.unitId) {
      const to = await tx.unit.findFirst({ where: { id: input.unitId, archivedAt: null, availability: "AVAILABLE", property: { ownerId: a.ownerId, archivedAt: null } }, select: { id: true, unitNumber: true, property: { select: { name: true } } } });
      if (!to) throw new AppError("INVALID_STATE", { reason: "unit_not_free" });
      data.unit = { connect: { id: to.id } };
      await tx.unit.update({ where: { id: a.unitId }, data: { availability: "AVAILABLE" } });
      await tx.unit.update({ where: { id: to.id }, data: { availability: "OCCUPIED" } });
      place = { property: to.property.name, unit: to.unitNumber };
      changes.push("moved");
    }
    if (changes.length === 0) return { id, changed: false as const };

    const out = await tx.rentalAgreement.update({ where: { id }, data, select: { endDate: true, noticeGivenAt: true } });
    const date = out.endDate ? out.endDate.toISOString().slice(0, 10) : "";
    for (const c of changes) {
      const key = c === "moved" ? "tenancyAdminMoved" : c === "end" ? "tenancyAdminEndDate" : c === "notice" ? "tenancyAdminNotice" : "tenancyAdminActive";
      const params = c === "end" ? { property: place.property, unit: place.unit, date } : { property: place.property, unit: place.unit };
      await notify([a.tenantId], { type: "tenancy.admin", titleKey: `notifications.${key}`, params, link: "/tenant/dashboard" }, tx);
      await notify([a.ownerId], { type: "tenancy.admin", titleKey: `notifications.${key}`, params, link: "/home-owner/tenants" }, tx);
    }
    await writeAudit({ actor, action: "tenancy.admin_edit", resourceType: "RentalAgreement", resourceId: id, before: JSON.parse(JSON.stringify({ unitId: a.unitId, endDate: a.endDate, notice: !!a.noticeGivenAt })), after: JSON.parse(JSON.stringify({ changes, unitId: input.unitId ?? a.unitId, endDate: out.endDate, notice: !!out.noticeGivenAt })), req }, tx);
    return { id, changed: true as const, changes, state: tenantState(out) };
  });
}

export { DOC_KINDS, docKindParam, documentReviewSchema, documentViews, addressText, type DocKindName } from "../shared/document-review";

/** Verify or reject one document of the tenant of this lease. */
export async function reviewTenantDocument(actor: Actor, id: string, kind: DocKindName, input: z.infer<typeof documentReviewSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const a = await db.rentalAgreement.findFirst({ where: { id, ...running }, select: { tenantId: true } });
  if (!a) throw new AppError("NOT_FOUND");
  return { id, ...(await reviewUserDocument(actor, a.tenantId, kind, input, req, "/tenant/profile")) };
}
