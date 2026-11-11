import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import { pageArgs, pageResult, uuid } from "@/lib/api/common";
import type { Actor } from "@/lib/auth/require-actor";
import { adminRangeQuery, resolveRange } from "./admin-range";

/** The six numbers on top of the Super Admin dashboard; the revenue follows the selected dates, the rest is "now". */
export async function adminKpis(actor: Actor, q: z.infer<typeof adminRangeQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const range = resolveRange(q);
  const live = { archivedAt: null, status: { not: "DELETED" as const } };
  const [revenue, owners, properties, tenants, paid] = await Promise.all([
    db.paymentTransaction.aggregate({ where: { status: "SUCCESS", purpose: "SUBSCRIPTION", verifiedAt: { gte: range.start, lte: range.end } }, _sum: { amount: true }, _count: { _all: true } }),
    db.user.count({ where: { role: "OWNER", ...live } }),
    db.property.count({ where: { archivedAt: null } }),
    db.user.count({ where: { role: "TENANT", archivedAt: null, status: "ACTIVE" } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(DISTINCT s."userId") AS n FROM "UserSubscription" s JOIN "User" u ON u.id = s."userId" WHERE s.audience = 'OWNER' AND s.status IN ('ACTIVE', 'GRACE') AND u.role = 'OWNER' AND u."archivedAt" IS NULL AND u.status <> 'DELETED'`,
  ]);
  const paidOwners = Math.min(Number(paid[0]?.n ?? 0), owners);
  return {
    range: { from: range.from, to: range.to },
    revenue: { currency: "BDT", amount: (revenue._sum.amount ?? 0).toString(), payments: revenue._count._all },
    totalOwners: owners,
    propertiesManaged: properties,
    activeTenants: tenants,
    paidOwners,
    unpaidOwners: owners - paidOwners,
  };
}

const SEGMENT_ROLES = { all: ["OWNER", "TENANT", "GENERAL_USER"], owners: ["OWNER"], tenants: ["TENANT"], free: ["GENERAL_USER"] } as const;

export const activePlansQuery = z.object({
  segment: z.enum(["all", "owners", "tenants", "free"]).default("all"),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(9),
});

export type PlanStatus = "ACTIVE" | "PENDING" | "NONE" | "SUSPENDED";

/** Who holds which plan: owners with their subscription, tenants with the building they live in, Tenant-Free accounts with nothing yet. */
export async function activePlans(actor: Actor, q: z.infer<typeof activePlansQuery>) {
  requireRole(actor, "SUPER_ADMIN");
  const roles = [...SEGMENT_ROLES[q.segment]];
  const where = { role: { in: roles }, archivedAt: null, status: { not: "DELETED" as const } };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, ...pageArgs(q),
      select: {
        id: true, fullName: true, username: true, email: true, role: true, status: true,
        properties: { where: { archivedAt: null }, orderBy: { id: "desc" }, take: 1, select: { type: true } },
        subscriptions: { where: { audience: "OWNER", status: { in: ["ACTIVE", "GRACE", "PENDING"] } }, orderBy: [{ createdAt: "desc" }], take: 3, select: { status: true, plan: { select: { code: true, nameEn: true, nameBn: true } } } },
        upgradeRequests: { where: { status: "PENDING" }, orderBy: { id: "desc" }, take: 1, select: { plan: { select: { code: true, nameEn: true, nameBn: true } } } },
      },
    }),
    db.user.count({ where }),
  ]);
  const page = pageResult(rows, q.limit);

  const tenantIds = page.items.filter((u) => u.role === "TENANT").map((u) => u.id);
  const leases = tenantIds.length
    ? await db.rentalAgreement.findMany({ where: { tenantId: { in: tenantIds }, status: { in: ["ACTIVE", "INVITED"] } }, orderBy: { id: "desc" }, select: { tenantId: true, status: true, unit: { select: { property: { select: { type: true } } } } } })
    : [];
  const leaseOf = (id: string) => {
    const mine = leases.filter((l) => l.tenantId === id);
    return mine.find((l) => l.status === "ACTIVE") ?? mine[0] ?? null;
  };

  const items = page.items.map((u) => {
    let status: PlanStatus = "NONE";
    let plan: (typeof u.subscriptions)[number]["plan"] | null = null;
    let propertyType: string | null = null;
    if (u.role === "OWNER") {
      const live = u.subscriptions.find((s) => s.status === "ACTIVE" || s.status === "GRACE");
      const waiting = u.subscriptions.find((s) => s.status === "PENDING")?.plan ?? u.upgradeRequests[0]?.plan ?? null;
      plan = live?.plan ?? waiting;
      status = live ? "ACTIVE" : waiting ? "PENDING" : "NONE";
      propertyType = u.properties[0]?.type ?? null;
    } else if (u.role === "TENANT") {
      const l = leaseOf(u.id);
      status = l?.status === "ACTIVE" ? "ACTIVE" : l ? "PENDING" : "NONE";
      propertyType = l?.unit.property.type ?? null;
    } else {
      status = u.upgradeRequests.length ? "PENDING" : "NONE";
    }
    if (u.status !== "ACTIVE") status = "SUSPENDED";
    return { id: u.id, fullName: u.fullName, username: u.username, email: u.email, role: u.role as "OWNER" | "TENANT" | "GENERAL_USER", propertyType, plan, status };
  });

  return { items, nextCursor: page.nextCursor, total };
}
