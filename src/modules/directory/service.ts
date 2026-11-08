import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, requireRole } from "@/lib/authz/authorize";
import { rateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, uuid, type pageQuery } from "@/lib/api/common";

/** Oversight lists for Gov Admin (read-only, no finances) and Super Admin. */
const staff = (a: Actor) => requireRole(a, "GOV_ADMIN", "SUPER_ADMIN");
export const maskNid = (last4: string | null) => (last4 ? `•••••••••${last4}` : null);

const person = { id: true, ownerCode: true, username: true, fullName: true, phone: true, email: true, nidLast4: true, verificationStatus: true, status: true, createdAt: true, archiveReason: true, archivedAt: true } as const;
type Person = Prisma.UserGetPayload<{ select: typeof person }>;
const card = ({ nidLast4, ...u }: Person) => ({ ...u, nid: maskNid(nidLast4) });

export const directoryQuery = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "INACTIVE", "DELETED"]).optional(),
  verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]).optional(),
  tier: z.string().regex(/^[A-Z_]{2,24}$/).optional(),
});

const search = (q?: string): Prisma.UserWhereInput =>
  q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { ownerCode: { contains: q.toUpperCase() } }] } : {};

export async function listOwners(actor: Actor, q: z.infer<typeof directoryQuery>, page: z.infer<typeof pageQuery>) {
  staff(actor);
  const rows = await db.user.findMany({
    where: {
      role: "OWNER", archivedAt: null, status: q.status ?? { in: ["ACTIVE", "SUSPENDED"] }, verificationStatus: q.verification, ...search(q.q),
      ...(q.tier ? { subscriptions: { some: { audience: "OWNER", status: { in: ["ACTIVE", "GRACE"] }, plan: { code: q.tier } } } } : {}),
    },
    select: { ...person, subscriptions: { where: { audience: "OWNER", status: { in: ["ACTIVE", "GRACE"] } }, select: { status: true, endsAt: true, plan: { select: { code: true, nameEn: true } } }, take: 1 }, _count: { select: { properties: { where: { archivedAt: null } } } } },
    ...pageArgs(page),
  });
  const out = rows.map(({ subscriptions, _count, ...u }) => ({ ...card(u), propertyCount: _count.properties, subscription: subscriptions[0] ?? null }));
  return pageResult(out, page.limit);
}

export async function listTenants(actor: Actor, q: z.infer<typeof directoryQuery>, page: z.infer<typeof pageQuery>) {
  staff(actor);
  const rows = await db.user.findMany({
    where: { role: "TENANT", archivedAt: null, status: q.status ?? { in: ["ACTIVE", "SUSPENDED"] }, verificationStatus: q.verification, ...search(q.q) },
    select: person,
    ...pageArgs(page),
  });
  const agreements = await db.rentalAgreement.findMany({
    where: { tenantId: { in: rows.map((r) => r.id) }, status: "ACTIVE" },
    select: { tenantId: true, ownerId: true, endDate: true, unit: { select: { unitNumber: true, property: { select: { id: true, name: true } } } } },
  });
  const owners = new Map((await db.user.findMany({ where: { id: { in: agreements.map((a) => a.ownerId) } }, select: { id: true, fullName: true } })).map((o) => [o.id, o]));
  const soon = Date.now() + 30 * 86400_000;
  const total = await db.unit.count({ where: { archivedAt: null } });
  const occupied = await db.unit.count({ where: { availability: "OCCUPIED" } });
  const out = rows.map((u) => {
    const a = agreements.find((x) => x.tenantId === u.id);
    return { ...card(u), tenancy: a ? { property: a.unit.property, unit: a.unit.unitNumber, owner: owners.get(a.ownerId) ?? null, endDate: a.endDate, leaseExpiringSoon: !!a.endDate && a.endDate.getTime() < soon } : null };
  });
  return { ...pageResult(out, page.limit), occupancyPercent: total ? Number(((occupied * 100) / total).toFixed(1)) : 0 };
}

export async function listProperties(actor: Actor, q: z.infer<typeof directoryQuery> & { verificationStatus?: string }, page: z.infer<typeof pageQuery>) {
  staff(actor);
  await authorize(actor, "property:read", { readOnly: true });
  const rows = await db.property.findMany({
    where: {
      archivedAt: null,
      verificationStatus: (q.verificationStatus ?? q.verification) as never,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { owner: { fullName: { contains: q.q, mode: "insensitive" } } }] } : {}),
    },
    select: { id: true, name: true, type: true, status: true, verificationStatus: true, createdAt: true, totalFloors: true, owner: { select: { id: true, fullName: true, ownerCode: true } }, zone: { select: { id: true, nameEn: true, nameBn: true } }, address: true, _count: { select: { units: true } } },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

export const archiveKind = z.enum(["properties", "owners", "tenants"]);
export const archiveQuery = z.object({ reason: z.string().trim().max(100).optional(), status: z.string().regex(/^[A-Z_]{3,20}$/).optional() });

/** "Previous Properties / Owners / Tenants" are queries over soft-deleted rows, not separate tables. */
export async function listArchive(actor: Actor, kind: z.infer<typeof archiveKind>, q: z.infer<typeof archiveQuery>, page: z.infer<typeof pageQuery>) {
  staff(actor);
  if (kind === "properties") {
    const rows = await db.property.findMany({
      where: { OR: [{ archivedAt: { not: null } }, { status: { in: ["SUSPENDED", "INACTIVE", "ARCHIVED"] } }], ...(q.status ? { status: q.status as never } : {}), ...(q.reason ? { archiveReason: { contains: q.reason, mode: "insensitive" } } : {}) },
      select: { id: true, name: true, status: true, archiveReason: true, archivedAt: true, owner: { select: { id: true, fullName: true } }, address: true }, ...pageArgs(page),
    });
    return pageResult(rows, page.limit);
  }
  if (kind === "owners") {
    const rows = await db.user.findMany({
      where: { role: "OWNER", OR: [{ archivedAt: { not: null } }, { status: { in: ["BANNED", "INACTIVE", "DELETED", "SUSPENDED"] } }], ...(q.status ? { status: q.status as never } : {}), ...(q.reason ? { archiveReason: { contains: q.reason, mode: "insensitive" } } : {}) },
      select: person, ...pageArgs(page),
    });
    return pageResult(rows.map(card), page.limit);
  }
  const ended = await db.rentalAgreement.findMany({
    where: { status: { in: ["ENDED", "TERMINATED"] } }, orderBy: { id: "desc" }, take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    select: { id: true, tenantId: true, rent: true, startDate: true, endDate: true, settlementAmount: true, status: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } }, rentRecords: { select: { total: true, paid: true } } },
  });
  const people = new Map((await db.user.findMany({ where: { id: { in: ended.map((e) => e.tenantId) } }, select: { id: true, fullName: true } })).map((p) => [p.id, p]));
  const rows = ended.map((e) => {
    const outstanding = e.rentRecords.reduce((s, r) => s.plus(r.total).minus(r.paid), new Prisma.Decimal(0));
    const years = e.endDate ? (e.endDate.getTime() - e.startDate.getTime()) / (365.25 * 86400_000) : null;
    return { id: e.id, tenant: people.get(e.tenantId) ?? null, property: e.unit.property.name, unit: e.unit.unitNumber, previousRent: e.rent, startDate: e.startDate, endDate: e.endDate, settlement: e.settlementAmount, status: e.status, years: years === null ? null : Number(years.toFixed(1)), rentCleared: outstanding.lte(0) };
  });
  const page2 = pageResult(rows, page.limit);
  const durations = page2.items.map((r) => r.years).filter((y): y is number => y !== null);
  return { ...page2, averageTenancyYears: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)) : null };
}

export const peopleSearchQuery = z.object({
  by: z.enum(["nid", "phone", "email", "id"]),
  q: z.string().trim().min(3).max(120),
});

/** Find People: exact lookup by NID / phone / email / account id. Rate limited and audit-logged (PII). */
export async function findPeople(actor: Actor, input: z.infer<typeof peopleSearchQuery>, req: Request) {
  await authorize(actor, "people:search");
  rateLimit(`people:${actor.id}`, 30, 60_000);
  const where: Prisma.UserWhereInput =
    input.by === "nid" ? { nidHash: sha256(input.q.replace(/\s/g, "")) }
    : input.by === "phone" ? { phone: input.q }
    : input.by === "email" ? { email: input.q.toLowerCase() }
    : { id: uuid.parse(input.q) };
  const u = await db.user.findFirst({
    where,
    select: { ...person, role: true, _count: { select: { properties: true } } },
  });
  await writeAudit({ actor, action: "people.search", resourceType: "User", resourceId: u?.id, after: { by: input.by, found: !!u }, req }); // never log the query itself
  if (!u) throw new AppError("NOT_FOUND");
  const { _count, ...rest } = u;
  return { ...card(rest), role: u.role, propertyCount: _count.properties };
}
