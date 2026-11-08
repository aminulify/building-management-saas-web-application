import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/require-actor";
import { computePrice, toPaisa, fromPaisa, CYCLE_MONTHS, type Cycle } from "@/shared/pricing";
import type { PlanCreate, PlanUpdate } from "./schema";

export const listActivePlans = () =>
  db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } });

export const listAllPlans = () => db.subscriptionPlan.findMany({ orderBy: { monthlyPrice: "asc" } });

/** Prices for all three cycles, computed server-side. */
export function priceTable(plan: { monthlyPrice: Prisma.Decimal; quarterlyDiscount: Prisma.Decimal; yearlyDiscount: Prisma.Decimal }) {
  const input = {
    monthlyPricePaisa: toPaisa(plan.monthlyPrice.toString()),
    quarterlyDiscount: Number(plan.quarterlyDiscount),
    yearlyDiscount: Number(plan.yearlyDiscount),
  };
  return Object.fromEntries(
    (Object.keys(CYCLE_MONTHS) as Cycle[]).map((c) => {
      const q = computePrice(input, c);
      return [c, { months: q.months, total: fromPaisa(q.totalPaisa), savings: fromPaisa(q.savingsPaisa) }];
    }),
  );
}

export async function createPlan(actor: Actor, data: PlanCreate, req: Request) {
  try {
    return await db.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.create({ data });
      await writeAudit(
        { actor, action: "plan.create", resourceType: "SubscriptionPlan", resourceId: plan.id, after: data, req },
        tx,
      );
      return plan;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT");
    throw e;
  }
}

/** Editing creates a new `version` and PlanPriceHistory rows; subscriptions keep their snapshot. */
export async function updatePlan(actor: Actor, id: string, data: PlanUpdate, req: Request) {
  return db.$transaction(async (tx) => {
    const before = await tx.subscriptionPlan.findUnique({ where: { id } });
    if (!before) throw new AppError("NOT_FOUND");

    const history = (Object.keys(data) as (keyof PlanUpdate)[])
      .filter((k) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(data[k]))
      .map((k) => ({
        planId: id,
        field: k,
        oldValue: JSON.stringify(before[k as keyof typeof before]),
        newValue: JSON.stringify(data[k]),
        changedById: actor.id,
      }));

    const plan = await tx.subscriptionPlan.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (history.length) await tx.planPriceHistory.createMany({ data: history });
    await writeAudit(
      { actor, action: "plan.update", resourceType: "SubscriptionPlan", resourceId: id, before: JSON.parse(JSON.stringify(before)), after: data, req },
      tx,
    );
    return plan;
  });
}

export async function setPlanActive(actor: Actor, id: string, isActive: boolean, req: Request) {
  return db.$transaction(async (tx) => {
    const before = await tx.subscriptionPlan.findUnique({ where: { id } });
    if (!before) throw new AppError("NOT_FOUND");
    const plan = await tx.subscriptionPlan.update({ where: { id }, data: { isActive } });
    await writeAudit(
      { actor, action: isActive ? "plan.activate" : "plan.deactivate", resourceType: "SubscriptionPlan", resourceId: id, before: { isActive: before.isActive }, after: { isActive }, req },
      tx,
    );
    return plan;
  });
}
