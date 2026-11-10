"use client";

import { Clock, Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { formatNumber, formatTaka } from "../dashboard/format";
import { daysUntil, monthlyBill, nextPlan, periodDays, periodLeftPercent } from "./plan-math";
import type { MySubscription, Plan } from "./types";

interface Props { sub: MySubscription; plans: Plan[] }

function Bar({ percent, label, caption, tone = "gradient" }: { percent: number; label: string; caption: string; tone?: "gradient" | "sky" }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[0.72rem] text-slate-300"><span>{label}</span><span className="font-semibold text-white">{caption}</span></div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-full bg-white/15">
        <motion.div
          initial={{ width: reduce ? `${pct}%` : 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={tone === "gradient" ? "h-full rounded-full bg-brand-gradient" : "h-full rounded-full bg-sky-400"}
        />
      </div>
    </div>
  );
}

/** The two cards at the top: what plan you are on (with the monthly bill and days to renewal) and how much of it you use. */
export function CurrentPlan({ sub, plans }: Props) {
  const t = useTranslations("owner.subscription.current");
  const locale = useLocale();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const cur = sub.current;
  const { usage, limits } = sub.owner;
  const grace = sub.owner.status === "GRACE";
  const name = cur ? (locale === "bn" ? cur.plan.nameBn : cur.plan.nameEn) : "";
  const next = nextPlan(plans, cur?.plan.code ?? null);
  const nextName = next ? (locale === "bn" ? next.nameBn : next.nameEn) : "";
  const left = cur ? daysUntil(grace ? cur.graceEndsAt : cur.endsAt) : 0;
  const unitPct = limits.unitLimit ? Math.round((usage.units / limits.unitLimit) * 100) : 0;
  const propPct = limits.propertyLimit ? Math.round((usage.properties / limits.propertyLimit) * 100) : 0;

  const lead = !cur
    ? t(sub.history.length ? "noneEnded" : "noneNew")
    : grace ? t("grace", { days: left })
    : next ? t("scale", { properties: usage.properties, units: usage.units, next: nextName })
    : t("top", { properties: usage.properties, units: usage.units });

  return (
    <div className="space-y-4">
      <FadeIn>
        <section className="relative overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/80 via-white/60 to-indigo-50/70 p-5 shadow-[0_8px_30px_-16px_rgba(10,132,240,0.35)] backdrop-blur-xl sm:p-6" aria-label={t("aria")}>
          <div aria-hidden className="pointer-events-none absolute -left-10 -top-12 size-44 rounded-full bg-[#48BDFA]/20 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-[#0A84F0] sm:text-[1.9rem]">{cur ? t("title", { name }) : t("noPlanTitle")}</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-700">{lead}</p>
            </div>
            {cur && (
              <div className="grid grid-cols-2 gap-3 xl:w-[22rem]">
                <div className="rounded-xl border border-sky-200 bg-white/80 p-3.5 shadow-sm">
                  <p className="text-xs font-semibold text-slate-600">{t("monthlyBill")}</p>
                  <p className="mt-0.5 text-xl font-extrabold text-[#0A84F0]"><CountUp value={Math.round(monthlyBill(cur))} format={taka} /></p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-white/80 p-3.5 shadow-sm">
                  <p className="text-xs font-semibold text-slate-600">{t(grace ? "graceEnds" : "renewsIn")}</p>
                  <p className="mt-0.5 flex items-baseline gap-1 text-xl font-extrabold text-[#0A84F0]"><CountUp value={left} format={n} /><span className="text-sm">{t("days", { n: left })}</span></p>
                </div>
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <section className="rounded-2xl bg-[#0b1226] p-5 text-white shadow-[0_16px_40px_-18px_rgba(11,18,38,0.8)] sm:p-6" aria-label={t("usageAria")}>
          <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-slate-400">{t("activePlan")}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold"><Star className="size-5 text-amber-300" aria-hidden />{cur ? t("tier", { name }) : t("noTier")}</p>
          {cur ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Bar percent={unitPct} label={t("unitsLabel")} caption={t("unitsUsed", { used: n(usage.units), limit: n(limits.unitLimit) })} />
              <Bar percent={periodLeftPercent(cur)} tone="sky" label={t("cycleLabel")} caption={t("daysLeft", { left: n(left), total: n(periodDays(cur)) })} />
              <Bar percent={propPct} label={t("propsLabel")} caption={t("propsUsed", { used: n(usage.properties), limit: n(limits.propertyLimit) })} tone="sky" />
              <Bar percent={limits.listingLimit ? Math.round((usage.listings / limits.listingLimit) * 100) : 0} label={t("listingsLabel")} caption={t("listingsUsed", { used: n(usage.listings), limit: n(limits.listingLimit) })} />
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-300"><Clock className="size-4" aria-hidden />{t("noUsage")}</p>
          )}
        </section>
      </FadeIn>
    </div>
  );
}
