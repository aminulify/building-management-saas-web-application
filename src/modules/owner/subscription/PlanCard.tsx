"use client";

import { Award, Check, Star, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, formatTaka } from "../dashboard/format";
import { cyclePrice, rangeOf, type PlanAction } from "./plan-math";
import type { Cycle, Plan } from "./types";

/** Each tier has its own accent (blue, pink, gold); buttons keep the brand gradient (design system). */
const THEMES: { icon: LucideIcon; text: string; check: string; glow: string; ring: string }[] = [
  { icon: Star, text: "text-sky-500", check: "text-sky-500", glow: "bg-[#48BDFA]/25", ring: "ring-sky-300" },
  { icon: Award, text: "text-pink-500", check: "text-pink-500", glow: "bg-[#F413E6]/20", ring: "ring-pink-300" },
  { icon: Zap, text: "text-amber-500", check: "text-amber-500", glow: "bg-[#F5B301]/25", ring: "ring-amber-300" },
];

interface Props {
  plan: Plan;
  plans: Plan[];
  index: number;
  cycle: Cycle;
  action: PlanAction;
  popular: boolean;
  /** a request is waiting for the Super Admin: nothing else can be bought now */
  locked: boolean;
  onChoose: (plan: Plan) => void;
}

export function PlanCard({ plan, plans, index, cycle, action, popular, locked, onChoose }: Props) {
  const t = useTranslations("owner.subscription.plans");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const theme = THEMES[index % THEMES.length]!;
  const name = locale === "bn" ? plan.nameBn : plan.nameEn;
  const [pLo, pHi] = rangeOf(plans, index, "propertyLimit");
  const [uLo, uHi] = rangeOf(plans, index, "unitLimit");
  const range = (lo: number, hi: number) => (lo === hi ? n(hi) : `${n(lo)}–${n(hi)}`);
  const level = (k?: string) => (k === "super" || k === "smart" ? "super" : k === "advanced" ? "high" : "basic");
  const savings = Number(plan.prices[cycle].savings);
  const months = plan.prices[cycle].months;
  const features = [
    t("props", { range: range(pLo, pHi) }),
    t("units", { range: range(uLo, uHi) }),
    t(`rent.${level(plan.features.rentTracking)}`),
    t("maintenance"),
    t("messaging"),
    t("listings", { n: n(plan.listingLimit) }),
  ];
  const active = action === "active";
  const label = action === "active" ? t("activePlan") : action === "renew" ? t("renew", { name }) : action === "upgrade" ? t("upgrade", { name }) : action === "switch" ? t("switch", { name }) : t("choose", { name });

  return (
    <motion.article
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-white/65 p-5 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_-16px_rgba(15,23,42,0.32)] motion-reduce:hover:translate-y-0",
        active ? `border-transparent ring-2 ${theme.ring}` : "border-white/70",
      )}
    >
      <div aria-hidden className={clsx("pointer-events-none absolute -bottom-10 -right-10 size-48 rounded-full blur-3xl", theme.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <theme.icon className={clsx("size-7", theme.text)} aria-hidden />
          <h3 className={clsx("mt-1.5 text-lg font-bold", theme.text)}>{name}</h3>
        </div>
        {popular && <span className="rounded-full bg-brand-gradient px-3 py-1 text-[0.68rem] font-bold text-white shadow-sm">{t("popular")}</span>}
      </div>

      <p className="relative mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tracking-tight text-navy">{taka(cyclePrice(plan, cycle))}</span>
        <span className="text-sm font-semibold text-slate-600">{t(cycle === "MONTHLY" ? "perMonth" : cycle === "QUARTERLY" ? "perMonths" : "perYear", { n: n(months) })}</span>
      </p>
      <p className="relative mt-1 h-5 text-xs font-semibold text-emerald-600">{savings > 0 ? t("save", { amount: taka(savings) }) : ""}</p>

      <ul className="relative mt-3 space-y-2.5 text-sm text-slate-700">
        {features.map((f) => <li key={f} className="flex items-start gap-2.5"><Check className={clsx("mt-0.5 size-4 shrink-0", theme.check)} aria-hidden />{f}</li>)}
      </ul>

      <button
        type="button" disabled={active || locked} onClick={() => onChoose(plan)}
        className={clsx("btn relative mt-6 h-11 w-full px-4 text-sm", active ? "border border-slate-200 bg-slate-100 text-slate-400" : "btn-primary")}
        title={locked && !active ? t("lockedHint") : undefined}
      >
        {locked && !active ? t("pending") : label}
      </button>
    </motion.article>
  );
}
