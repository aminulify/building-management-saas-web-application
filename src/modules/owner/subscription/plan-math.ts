import { CYCLE_MONTHS } from "@/shared/pricing";
import type { Cycle, CurrentSubscription, Plan } from "./types";

export const CYCLES: Cycle[] = ["MONTHLY", "QUARTERLY", "YEARLY"];
const DAY = 86_400_000;

export const discountOf = (plan: Pick<Plan, "quarterlyDiscount" | "yearlyDiscount">, cycle: Cycle) => (cycle === "QUARTERLY" ? plan.quarterlyDiscount : cycle === "YEARLY" ? plan.yearlyDiscount : 0);

/** The price shown on a plan card: the server's own table for that cycle (whole taka on the card, exact amount in the payment window). */
export const cyclePrice = (plan: Plan, cycle: Cycle) => Number(plan.prices[cycle].total);

/** "1–2 properties", "3–4 properties": each plan starts where the cheaper one ends. */
export function rangeOf(plans: Plan[], index: number, key: "propertyLimit" | "unitLimit"): [number, number] {
  const hi = plans[index]![key];
  const lo = index === 0 ? 1 : plans[index - 1]![key] + 1;
  return [Math.min(lo, hi), hi];
}

/** Whole days between now and a date (never negative). */
export const daysUntil = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY)) : 0);

/** How much of the paid period is left, as 0–100. */
export function periodLeftPercent(sub: Pick<CurrentSubscription, "startsAt" | "endsAt">, now = Date.now()): number {
  if (!sub.startsAt || !sub.endsAt) return 0;
  const total = new Date(sub.endsAt).getTime() - new Date(sub.startsAt).getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((new Date(sub.endsAt).getTime() - now) / total) * 100)));
}

export const periodDays = (sub: Pick<CurrentSubscription, "startsAt" | "endsAt">) => (sub.startsAt && sub.endsAt ? Math.max(1, Math.round((new Date(sub.endsAt).getTime() - new Date(sub.startsAt).getTime()) / DAY)) : 0);

/** What a month of the current plan costs: the amount paid spread over the months it covers. */
export const monthlyBill = (sub: Pick<CurrentSubscription, "amount" | "cycle">) => Number(sub.amount) / CYCLE_MONTHS[sub.cycle];

/** The cheapest plan above the current one (the "scale up" suggestion), or null on the top plan. */
export const nextPlan = (plans: Plan[], currentCode: string | null) => {
  const i = plans.findIndex((p) => p.code === currentCode);
  return i >= 0 ? (plans[i + 1] ?? null) : null;
};

export type PlanAction = "active" | "renew" | "upgrade" | "switch" | "choose";

/** What the button of a plan card does, given the plan the person has now. */
export function actionFor(plans: Plan[], plan: Plan, currentCode: string | null, renewable: boolean): PlanAction {
  if (!currentCode) return "choose";
  if (plan.code === currentCode) return renewable ? "renew" : "active";
  const cur = plans.findIndex((p) => p.code === currentCode);
  const idx = plans.findIndex((p) => p.code === plan.code);
  return idx > cur ? "upgrade" : "switch";
}
