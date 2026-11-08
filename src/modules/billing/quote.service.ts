import type { BillingCycle, SubscriptionPlan } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/authz/authorize";
import { getEntitlement } from "@/lib/authz/entitlement";
import type { Actor } from "@/lib/auth/require-actor";
import { computePrice, fromPaisa, toPaisa } from "@/shared/pricing";

const priceInput = (p: SubscriptionPlan) => ({
  monthlyPricePaisa: toPaisa(p.monthlyPrice.toString()),
  quarterlyDiscount: Number(p.quarterlyDiscount),
  yearlyDiscount: Number(p.yearlyDiscount),
});

export async function getPaymentInfo() {
  const s = await db.platformSetting.findUnique({ where: { key: "payment.bkash.personalNumber" } });
  return { bkashPersonalNumber: (s?.value as string | undefined) ?? null };
}

/** Roles allowed to buy a plan of the given audience (D13: active tenants cannot become owners). */
export async function assertCanBuy(actor: Actor, plan: SubscriptionPlan) {
  if (!plan.isActive) throw new AppError("PLAN_INACTIVE");
  if (plan.audience === "OWNER") {
    if (actor.role === "OWNER" || actor.role === "GENERAL_USER") return;
    if (actor.role === "TENANT") {
      const active = await db.rentalAgreement.count({ where: { tenantId: actor.id, status: "ACTIVE" } });
      if (active === 0) return;
      throw new AppError("INVALID_STATE", { reason: "active_tenancy_blocks_owner_upgrade" });
    }
  } else if (actor.role === "TENANT" || actor.role === "GENERAL_USER") return;
  throw new AppError("FORBIDDEN", { reason: "plan_not_for_role" });
}

/**
 * Server-side price. Upgrade credit (architecture 9.4.6): unused days of the current live plan × its daily rate,
 * only when the new plan's monthly price is higher.
 */
export async function buildQuote(actor: Actor, planId: string, cycle: BillingCycle) {
  await authorize(actor, "subscription:purchase");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("NOT_FOUND");
  await assertCanBuy(actor, plan);

  // downgrade guard (architecture 9.4.7): current usage must fit inside the target plan
  const ent = await getEntitlement(actor.id, plan.audience);
  const exceeds = plan.audience === "OWNER" ? ent.usage.properties > plan.propertyLimit || ent.usage.units > plan.unitLimit : ent.usage.listings > plan.listingLimit;
  if (exceeds) throw new AppError("INVALID_STATE", { reason: "usage_exceeds_plan", usage: ent.usage, caps: { properties: plan.propertyLimit, units: plan.unitLimit, listings: plan.listingLimit } });

  const q = computePrice(priceInput(plan), cycle);
  let creditPaisa = 0;
  const current = await db.userSubscription.findFirst({
    where: { userId: actor.id, audience: plan.audience, status: "ACTIVE", endsAt: { gt: new Date() } },
    include: { plan: true },
  });
  if (current?.startsAt && current.endsAt && plan.monthlyPrice.gt(current.plan.monthlyPrice)) {
    const total = current.endsAt.getTime() - current.startsAt.getTime();
    const left = current.endsAt.getTime() - Date.now();
    creditPaisa = Math.min(Math.round(toPaisa(current.amount.toString()) * Math.max(0, left / total)), q.totalPaisa);
  }
  const payablePaisa = q.totalPaisa - creditPaisa;
  const info = await getPaymentInfo();

  return {
    plan: { id: plan.id, code: plan.code, nameBn: plan.nameBn, nameEn: plan.nameEn, audience: plan.audience },
    cycle, months: q.months, discountPercent: q.discountPercent,
    total: fromPaisa(q.totalPaisa), savings: fromPaisa(q.savingsPaisa),
    upgradeCredit: fromPaisa(creditPaisa), payable: fromPaisa(payablePaisa),
    payablePaisa, currency: "BDT",
    payment: { method: "BKASH_SEND_MONEY", number: info.bkashPersonalNumber, reference: actor.username },
  };
}

/**
 * Monthly landlord fee calculator: maps the number of properties a landlord manages to the cheapest
 * plan whose cap covers it (CLAUDE.md: 1–2 → ৳159, 2–4 → ৳299, 4–12 → ৳699 per month).
 */
export async function estimateFee(properties: number, cycle: BillingCycle) {
  const plans = await db.subscriptionPlan.findMany({ where: { audience: "OWNER", isActive: true }, orderBy: { propertyLimit: "asc" } });
  const plan = plans.find((p) => p.propertyLimit >= properties);
  if (!plan) throw new AppError("NOT_FOUND", { reason: "no_plan_covers_property_count" });
  const q = computePrice(priceInput(plan), cycle);
  return {
    properties, cycle,
    plan: { id: plan.id, code: plan.code, nameEn: plan.nameEn, nameBn: plan.nameBn, propertyLimit: plan.propertyLimit, unitLimit: plan.unitLimit },
    monthlyFee: fromPaisa(toPaisa(plan.monthlyPrice.toString())),
    effectiveMonthlyFee: fromPaisa(Math.round(q.totalPaisa / q.months)),
    billedNow: fromPaisa(q.totalPaisa), savings: fromPaisa(q.savingsPaisa), currency: "BDT",
  };
}
