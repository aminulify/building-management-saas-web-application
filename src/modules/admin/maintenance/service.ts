import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { pageArgs, pageResult, uuid } from "@/lib/api/common";
import { removeStorageKeys, signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import { adminRangeQuery, dhakaToday, resolveRange } from "@/modules/dashboards/admin-range";
import type { Actor } from "@/lib/auth/require-actor";

/** Super Admin → Active Maintenance: every maintenance request on the platform, with numbers for the chosen dates. */

const STATUSES = ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const OPEN = ["PENDING", "APPROVED", "IN_PROGRESS"] as const;

/** The five groups of the report. Everything that is not Electrical, Plumbing, Water or Security (gas, lift, paint, cleaning, other) is "Other". */
export const BUCKETS = ["ELECTRICAL", "PLUMBING", "WATER", "SECURITY", "OTHER"] as const;
export const bucketOf = (category: string) => ((BUCKETS as readonly string[]).includes(category) && category !== "OTHER" ? category : "OTHER");

/** The page opens on the last 30 days, like the Report page. */
const range = (q: z.infer<typeof adminRangeQuery>) => {
  const to = q.to ?? dhakaToday();
  return resolveRange({ from: q.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10), to });
};

/** Percentages that always add up to exactly 100 (largest remainder), so the bars never show 99 or 101. */
export function normalizePercent(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  [...exact.keys()].sort((a, b) => (exact[b]! % 1) - (exact[a]! % 1)).forEach((i) => { if (left-- > 0) out[i]!++; });
  return out;
}

export async function maintenanceStats(actor: Actor, q: z.infer<typeof adminRangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const r = range(q);
  const inRange = { createdAt: { gte: r.start, lte: r.end } };
  const [total, open, critical, avg, byCategory] = await Promise.all([
    db.maintenanceRequest.count({ where: inRange }),
    db.maintenanceRequest.count({ where: { ...inRange, status: { in: [...OPEN] } } }),
    db.maintenanceRequest.count({ where: { ...inRange, priority: "CRITICAL", status: { in: [...OPEN] } } }),
    db.$queryRaw<{ days: number | null; n: bigint }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 86400)::float AS days, count(*) AS n
      FROM "MaintenanceRequest" WHERE status = 'COMPLETED' AND "resolvedAt" IS NOT NULL AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}`,
    db.maintenanceRequest.groupBy({ by: ["category"], where: inRange, _count: { _all: true } }),
  ]);
  const sums = new Map<string, number>(BUCKETS.map((b) => [b, 0]));
  for (const c of byCategory) sums.set(bucketOf(c.category), (sums.get(bucketOf(c.category)) ?? 0) + c._count._all);
  const cats = BUCKETS.map((b) => ({ category: b as string, count: sums.get(b) ?? 0 }));
  const pct = normalizePercent(cats.map((c) => c.count));
  const days = avg[0]?.days;
  return {
    range: { from: r.from, to: r.to },
    total, open, critical,
    avgResolutionDays: days == null ? null : Math.round(days * 10) / 10,
    resolvedCount: Number(avg[0]?.n ?? 0),
    categories: total === 0 ? [] : cats.map((c, i) => ({ ...c, percent: pct[i]! })),
  };
}

export const maintenanceListQuery = z.object({
  status: z.enum(["all", ...STATUSES]).default("all"),
  priority: z.enum(["all", ...PRIORITIES]).default("all"),
  category: z.enum(BUCKETS).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

/** "REQ-1001", "req 1001" or just "1001" is a ticket number; anything else is words. */
export const ticketOf = (q: string) => { const m = /^(?:req[-\s]?)?(\d{3,9})$/i.exec(q.trim()); return m ? Number(m[1]) : null; };

const personSelect = { id: true, fullName: true, phone: true, email: true, ownerCode: true, tenantCode: true, avatarKey: true } as const;

export async function maintenanceList(actor: Actor, q: z.infer<typeof maintenanceListQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const and: Prisma.MaintenanceRequestWhereInput[] = [];
  if (q.status !== "all") and.push({ status: q.status });
  if (q.priority !== "all") and.push({ priority: q.priority });
  if (q.category) and.push(q.category === "OTHER" ? { category: { notIn: BUCKETS.filter((b) => b !== "OTHER") } } : { category: q.category });
  if (q.q) {
    const has = (v: string) => ({ contains: v, mode: "insensitive" as const });
    const no = ticketOf(q.q);
    const people = await db.user.findMany({ where: { OR: [{ fullName: has(q.q) }, { username: has(q.q) }, { phone: { contains: q.q } }, { ownerCode: has(q.q) }, { tenantCode: has(q.q) }] }, select: { id: true }, take: 100 });
    const ids = people.map((p) => p.id);
    and.push({ OR: [
      ...(no ? [{ ticketNo: no }] : []),
      { title: has(q.q) }, { unit: { unitNumber: has(q.q) } }, { unit: { property: { name: has(q.q) } } },
      ...(ids.length ? [{ tenantId: { in: ids } }, { agreement: { ownerId: { in: ids } } }] : []),
    ] });
  }
  const where: Prisma.MaintenanceRequestWhereInput = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    db.maintenanceRequest.findMany({
      where, ...pageArgs(q),
      select: {
        id: true, ticketNo: true, title: true, category: true, priority: true, status: true, technicianName: true, createdAt: true, resolvedAt: true,
        tenantId: true, agreement: { select: { ownerId: true } },
        unit: { select: { unitNumber: true, property: { select: { name: true } } } },
      },
    }),
    db.maintenanceRequest.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);
  const ids = [...new Set(page.items.flatMap((r) => [r.tenantId, r.agreement.ownerId]))];
  const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: personSelect })).map((u) => [u.id, u]));
  const items = page.items.map(({ agreement, tenantId, ...r }) => {
    const o = users.get(agreement.ownerId), t = users.get(tenantId);
    return { ...r, owner: { id: agreement.ownerId, fullName: o?.fullName ?? "", ownerCode: o?.ownerCode ?? null, phone: o?.phone ?? null }, tenant: { id: tenantId, fullName: t?.fullName ?? "", tenantCode: t?.tenantCode ?? null } };
  });
  return { items, nextCursor: page.nextCursor, total };
}

const avatar = (key: string | null) => (key ? signStorageKey(key, 3600).then((s) => s.url).catch(() => null) : Promise.resolve(null));

export async function maintenanceDetails(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const r = await db.maintenanceRequest.findUnique({
    where: { id },
    include: {
      images: { orderBy: { id: "asc" } }, comments: { orderBy: { id: "asc" } }, agreement: { select: { ownerId: true, startDate: true, rent: true } },
      unit: { select: { id: true, unitNumber: true, floor: true, bedrooms: true, bathrooms: true, areaSqft: true, property: { select: { id: true, name: true, type: true, totalFloors: true, locationText: true, status: true, address: { select: { division: true, district: true, upazila: true, area: true, street: true } } } } } },
    },
  });
  if (!r) throw new AppError("NOT_FOUND");
  const prop = r.unit.property;
  const authorIds = [...new Set(r.comments.map((c) => c.authorId))];
  const [users, units, living, issueRows, recent, ownerProps, ownerTenants] = await Promise.all([
    db.user.findMany({ where: { id: { in: [r.tenantId, r.agreement.ownerId, ...authorIds] } }, select: { ...personSelect, createdAt: true } }),
    db.unit.count({ where: { propertyId: prop.id } }),
    db.rentalAgreement.groupBy({ by: ["unitId"], where: { status: "ACTIVE", unit: { propertyId: prop.id } } }),
    db.maintenanceRequest.groupBy({ by: ["status"], where: { unit: { propertyId: prop.id } }, _count: { _all: true } }),
    db.maintenanceRequest.findMany({
      where: { unit: { propertyId: prop.id } }, orderBy: { id: "desc" }, take: 8,
      select: { id: true, ticketNo: true, title: true, status: true, priority: true, category: true, createdAt: true, unit: { select: { unitNumber: true, floor: true } } },
    }),
    db.property.count({ where: { ownerId: r.agreement.ownerId, archivedAt: null } }),
    db.rentalAgreement.count({ where: { ownerId: r.agreement.ownerId, status: "ACTIVE" } }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const t = byId.get(r.tenantId), o = byId.get(r.agreement.ownerId);
  const [urls, tAvatar, oAvatar] = await Promise.all([signStorageKeys(r.images.map((i) => i.storageKey), 3600), avatar(t?.avatarKey ?? null), avatar(o?.avatarKey ?? null)]);
  const counts = Object.fromEntries(issueRows.map((x) => [x.status, x._count._all])) as Record<string, number>;
  const sum = (...k: string[]) => k.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const a = prop.address;
  const seen = new Set<string>();
  const place = [prop.locationText, a?.street, a?.area, a?.upazila, a?.district, a?.division].flatMap((x) => (x ?? "").split(",")).map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(", ");
  const { agreement, images, comments, tenantId, unit, ...rest } = r;
  return {
    ...rest,
    unit: { unitNumber: unit.unitNumber, floor: unit.floor, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms, areaSqft: unit.areaSqft, property: { name: prop.name } },
    property: {
      name: prop.name, type: prop.type, totalFloors: prop.totalFloors, location: place, status: prop.status,
      flats: units, occupied: living.length, vacant: Math.max(0, units - living.length),
      issues: { total: sum(...Object.keys(counts)), open: sum("PENDING", "APPROVED", "IN_PROGRESS"), resolved: sum("COMPLETED"), other: sum("REJECTED", "CANCELLED") },
      recent: recent.map((x) => ({ id: x.id, ticketNo: x.ticketNo, title: x.title, status: x.status, priority: x.priority, category: x.category, createdAt: x.createdAt, unitNumber: x.unit.unitNumber, floor: x.unit.floor })),
    },
    images: images.map((i) => ({ id: i.id, url: urls.get(i.storageKey) ?? null })),
    comments: comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: byId.get(c.authorId)?.fullName ?? "" })),
    tenant: { id: tenantId, fullName: t?.fullName ?? "", tenantCode: t?.tenantCode ?? null, phone: t?.phone ?? null, email: t?.email ?? null, avatarUrl: tAvatar, memberSince: t?.createdAt ?? null, movedIn: agreement.startDate, rent: agreement.rent.toString() },
    owner: { id: agreement.ownerId, fullName: o?.fullName ?? "", ownerCode: o?.ownerCode ?? null, phone: o?.phone ?? null, email: o?.email ?? null, avatarUrl: oAvatar, memberSince: o?.createdAt ?? null, properties: ownerProps, tenants: ownerTenants },
  };
}

/** Edit window: priority, status and the technician's name. Everyone involved is told what changed. */
export const maintenanceEditSchema = z.object({
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"]).optional(),
  technicianName: z.string().trim().min(2).max(80).nullable().optional(),
}).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: "empty_update" });

export async function maintenanceEdit(actor: Actor, id: string, input: z.infer<typeof maintenanceEditSchema>, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const r = await tx.maintenanceRequest.findUnique({ where: { id }, include: { agreement: { select: { ownerId: true } }, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } });
    if (!r) throw new AppError("NOT_FOUND");
    const statusChanged = input.status !== undefined && input.status !== r.status;
    const priorityChanged = input.priority !== undefined && input.priority !== r.priority;
    const techChanged = input.technicianName !== undefined && input.technicianName !== r.technicianName;
    if (!statusChanged && !priorityChanged && !techChanged) return { id, changed: false as const };
    const out = await tx.maintenanceRequest.update({
      where: { id },
      data: {
        ...(statusChanged ? { status: input.status, resolvedAt: input.status === "COMPLETED" ? new Date() : null } : {}),
        ...(priorityChanged ? { priority: input.priority } : {}),
        ...(techChanged ? { technicianName: input.technicianName } : {}),
      },
      select: { id: true, ticketNo: true, status: true, priority: true, technicianName: true },
    });
    const where = { unit: r.unit.unitNumber, property: r.unit.property.name, requestId: id };
    if (statusChanged) {
      await notify([r.tenantId], { type: "maintenance.status", titleKey: "notifications.maintenanceStatus", params: { status: out.status, title: r.title, unit: where.unit, property: where.property, requestId: id }, link: "/tenant/maintenance" }, tx);
      await notify([r.agreement.ownerId], { type: "maintenance.status", titleKey: "notifications.maintenanceStatus", params: { status: out.status, title: r.title, unit: where.unit, property: where.property, requestId: id }, link: "/home-owner/maintenance" }, tx);
    }
    if (priorityChanged) {
      await notify([r.tenantId], { type: "maintenance.priority", titleKey: "notifications.maintenancePriority", params: { title: r.title, priority: out.priority, unit: where.unit, property: where.property, requestId: id }, link: "/tenant/maintenance" }, tx);
      await notify([r.agreement.ownerId], { type: "maintenance.priority", titleKey: "notifications.maintenancePriority", params: { title: r.title, priority: out.priority, unit: where.unit, property: where.property, requestId: id }, link: "/home-owner/maintenance", priority: out.priority === "CRITICAL" ? "HIGH" : "NORMAL" }, tx);
    }
    await writeAudit({ actor, action: "maintenance.admin_edit", resourceType: "MaintenanceRequest", resourceId: id, before: { status: r.status, priority: r.priority, technicianName: r.technicianName }, after: { status: out.status, priority: out.priority, technicianName: out.technicianName }, req }, tx);
    return { id, changed: true as const, ticketNo: out.ticketNo, status: out.status, priority: out.priority, technicianName: out.technicianName };
  });
}

/** The request is removed for good (photos and comments with it); the tenant and the owner are both told. */
export async function maintenanceDelete(actor: Actor, id: string, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const r = await db.maintenanceRequest.findUnique({ where: { id }, include: { agreement: { select: { ownerId: true } }, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } });
  if (!r) throw new AppError("NOT_FOUND");
  const images = await db.maintenanceImage.findMany({ where: { requestId: id }, select: { storageKey: true } });
  await db.$transaction(async (tx) => {
    await tx.maintenanceComment.deleteMany({ where: { requestId: id } });
    await tx.maintenanceImage.deleteMany({ where: { requestId: id } });
    await tx.maintenanceRequest.delete({ where: { id } });
    const ticketLabel = `REQ-${r.ticketNo}`, unitNo = r.unit.unitNumber, propertyName = r.unit.property.name;
    await notify([r.tenantId, r.agreement.ownerId], { type: "maintenance.deleted", titleKey: "notifications.maintenanceRemovedByAdmin", params: { title: r.title, ticket: ticketLabel, unit: unitNo, property: propertyName } }, tx);
    await writeAudit({ actor, action: "maintenance.admin_delete", resourceType: "MaintenanceRequest", resourceId: id, before: { ticketNo: r.ticketNo, status: r.status, title: r.title, priority: r.priority }, req }, tx);
  });
  if (images.length) await removeStorageKeys(images.map((i) => i.storageKey)).catch(() => undefined);
  return { id, deleted: true as const };
}
