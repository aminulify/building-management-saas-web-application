"use client";

import { AlertTriangle, Award, RefreshCw, Rocket, Star, Users, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatCount } from "../dashboard/format";
import type { ReportPlans } from "./types";

const BOOST_LOOK = { bar: "from-[#9333EA] to-[#C084FC]", chip: "bg-purple-100 text-[#9333EA]", icon: Rocket };

interface Props { data: ReportPlans | null; state: "loading" | "ready" | "error"; onRetry: () => void }

const LOOK: { bar: string; chip: string; icon: LucideIcon }[] = [
  { bar: "from-[#0A84F0] to-[#48BDFA]", chip: "bg-sky-100 text-[#0A84F0]", icon: Star },
  { bar: "from-[#EC4899] to-[#F9A8D4]", chip: "bg-pink-100 text-[#EC4899]", icon: Award },
  { bar: "from-[#F59E0B] to-[#FCD34D]", chip: "bg-amber-100 text-amber-600", icon: Zap },
];

/** How many owners hold each plan right now: one meter per plan, the longest meter is the most popular plan. */
export function PlansMeter({ data, state, onRetry }: Props) {
  const t = useTranslations("admin.report.plans");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const count = formatCount(locale);
  const top = Math.max(1, data?.boost ?? 0, ...(data?.items ?? []).map((p) => p.subscribers));
  const rows = data ? [...data.items.map((p, i) => ({ code: p.code, name: locale === "bn" ? p.nameBn : p.nameEn, n: p.subscribers, look: LOOK[i % LOOK.length]!, unit: t("subscribers") })), { code: "BOOST", name: t("boost"), n: data.boost, look: BOOST_LOOK, unit: t("boostsBought") }] : [];

  return (
    <section aria-labelledby="pm-title" className="glass-card p-4 sm:p-6">
      <h2 id="pm-title" className="text-xl font-bold text-navy">{t("title")}</h2>
      <p className="mt-0.5 text-sm text-slate-600">{t("subtitle")}</p>
      {state === "error" && !data ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      ) : !data ? (
        <div className="mt-5 space-y-4" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 w-full rounded-xl" />)}</div>
      ) : data.items.length === 0 && data.boost === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Users className="size-6" /></span><p className="font-semibold text-navy">{t("empty")}</p></div>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((p, i) => {
            const look = p.look, Icon = look.icon;
            return (
              <li key={p.code}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-navy"><span aria-hidden className={`grid size-7 place-items-center rounded-lg ${look.chip}`}><Icon className="size-4" /></span>{p.name}</span>
                  <span className="font-bold text-navy"><CountUp value={p.n} format={count} /> <span className="font-medium text-slate-500">{p.unit}</span></span>
                </div>
                <div role="meter" aria-label={p.name} aria-valuemin={0} aria-valuemax={top} aria-valuenow={p.n} className="h-3 overflow-hidden rounded-full bg-slate-200/70">
                  <motion.div initial={{ width: reduce ? `${(p.n / top) * 100}%` : 0 }} whileInView={{ width: `${(p.n / top) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.08, ease: "easeOut" }} className={`h-full rounded-full bg-gradient-to-r ${look.bar}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
