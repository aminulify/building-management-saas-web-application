import type { Prisma, PlanAudience } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import type { Actor } from "../auth/require-actor";
import { ownerGaps, raiseOwnerRestriction, resolveOwnerNotices } from "./owner-readiness";

export interface Limits {
  propertyLimit: number;
  unitLimit: number;
  listingLimit: number;
  listingDurationDays: number;
}

export interface Entitlement {
  status: "NONE" | "ACTIVE" | "GRACE";
  planCode: string | null;
  limits: Limits;
  usage: { properties: number; units: number; listings: number };
  features: Record<string, unknown>;
}

const ZERO: Limits = { propertyLimit: 0, unitLimit: 0, listingLimit: 0, listingDurationDays: 0 };

/** Computed from the ACTIVE/GRACE subscription's planSnapshot (so later plan edits never change it). */
export async function getEntitlement(
  userId: string,
  audience: PlanAudience = "OWNER",
  tx: Prisma.TransactionClient = db,
): Promise<Entitlement> {
  const sub = await tx.userSubscription.findFirst({
    where: { userId, audience, status: { in: ["ACTIVE", "GRACE"] } },
    orderBy: { createdAt: "desc" },
  });

  const [properties, units, listings] = await Promise.all([
    tx.property.count({ where: { ownerId: userId, archivedAt: null } }),
    tx.unit.count({ where: { property: { ownerId: userId }, archivedAt: null } }),
    tx.listing.count({ where: { sellerId: userId, status: { in: ["PENDING", "PUBLISHED"] } } }),
  ]);
  const usage = { properties, units, listings };

  if (!sub) return { status: "NONE", planCode: null, limits: ZERO, usage, features: {} };

  const snap = sub.planSnapshot as Partial<Limits> & { code?: string; features?: Record<string, unknown> };
  return {
    status: sub.status as "ACTIVE" | "GRACE",
    planCode: snap.code ?? null,
    limits: {
      propertyLimit: snap.propertyLimit ?? 0,
      unitLimit: snap.unitLimit ?? 0,
      listingLimit: snap.listingLimit ?? 0,
      listingDurationDays: snap.listingDurationDays ?? 0,
    },
    usage,
    features: snap.features ?? {},
  };
}

export type EntitlementKind = "property" | "unit" | "listing";

/**
 * Blocks creation when there is no plan, the plan is in GRACE (new items blocked, architecture D10),
 * or the cap would be exceeded. Call inside the same transaction as the insert.
 */
export async function assertEntitlement(
  actor: Actor,
  kind: EntitlementKind,
  opts: { delta?: number; tx?: Prisma.TransactionClient } = {},
): Promise<Entitlement> {
  // Super Admin (and a Gov Admin who was granted listing:create) are not bound by subscription plans
  if (actor.role === "SUPER_ADMIN" || actor.role === "GOV_ADMIN") {
    return { status: "ACTIVE", planCode: "STAFF", limits: { propertyLimit: 1e9, unitLimit: 1e9, listingLimit: 1e9, listingDurationDays: 30 }, usage: { properties: 0, units: 0, listings: 0 }, features: {} };
  }
  const delta = opts.delta ?? 1;
  const audience: PlanAudience = kind === "listing" && actor.role !== "OWNER" ? "SELLER" : "OWNER";
  if (opts.tx) {
    // serialise concurrent creates for the same user (architecture 5.2)
    await opts.tx.$queryRaw`SELECT id FROM "UserSubscription" WHERE "userId" = ${actor.id}::uuid AND status IN ('ACTIVE','GRACE') FOR UPDATE`;
  }
  const ent = await getEntitlement(actor.id, audience, opts.tx);

  // An apartment owner is fully unlocked only with an active plan, an approved payment and a verified NID with a complete profile.
  // Whatever is missing is told in the notification center (and stays there until it is done).
  const gaps = actor.role === "OWNER" ? await ownerGaps(actor.id, opts.tx) : [];
  if (gaps.length > 0) await raiseOwnerRestriction(actor.id, gaps);

  if (ent.status === "NONE") {
    throw new AppError(kind === "listing" ? "LISTING_ENTITLEMENT_REQUIRED" : "SUBSCRIPTION_REQUIRED", { missing: gaps });
  }
  if (ent.status === "GRACE") throw new AppError("SUBSCRIPTION_GRACE_RESTRICTED");
  if (gaps.length > 0) throw new AppError("OWNER_NOT_READY", { missing: gaps });
  if (actor.role === "OWNER") await resolveOwnerNotices(actor.id);

  const map = {
    property: [ent.usage.properties, ent.limits.propertyLimit],
    unit: [ent.usage.units, ent.limits.unitLimit],
    listing: [ent.usage.listings, ent.limits.listingLimit],
  } as const;
  const [used, cap] = map[kind];
  if (used + delta > cap) throw new AppError("PLAN_LIMIT_REACHED", { kind, used, cap });
  return ent;
}
