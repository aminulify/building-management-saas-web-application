"use client";

import { AlertCircle, AlertTriangle, Users, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber } from "../dashboard/format";
import type { DirectoryPage, TenantTab } from "./types";

type Stats = DirectoryPage["stats"];

const TONE = {
  purple: { card: "border-violet-400 bg-violet-100/60", num: "text-violet-600", chip: "border-violet-400 bg-violet-200/70 text-violet-600" },
  amber: { card: "border-amber-400 bg-amber-100/60", num: "text-amber-500", chip: "border-amber-400 bg-amber-200/70 text-amber-600" },
  red: { card: "border-red-400 bg-red-100/60", num: "text-red-600", chip: "border-red-400 bg-red-200/70 text-red-600" },
} as const;

interface Props { stats: Stats | null; tab: TenantTab; onTab: (t: TenantTab) => void }

/** Three headline numbers; clicking one opens the matching tab of the table. */
export function TenantStats({ stats, tab, onTab }: Props) {
  const t = useTranslations("owner.tenants.stats");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);

  if (!stats) return <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[112px] rounded-2xl" />)}</div>;

  const cards: { key: string; tone: keyof typeof TONE; icon: LucideIcon; value: number; label: string; sub: string; goTo: TenantTab }[] = [
    { key: "active", tone: "purple", icon: Users, value: stats.active, label: t("active"), sub: t("activeSub", { n: n(stats.joinedLast30Days) }), goTo: "all" },
    { key: "leaveSoon", tone: "amber", icon: AlertCircle, value: stats.leaveSoon, label: t("leaveSoon"), sub: t("leaveSoonSub"), goTo: "leaveSoon" },
    { key: "overdue", tone: "red", icon: AlertTriangle, value: stats.overdue, label: t("overdue"), sub: t("overdueSub"), goTo: "overdue" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c, i) => {
        const tone = TONE[c.tone];
        const Icon = c.icon;
        return (
          <motion.button
            key={c.key} type="button" onClick={() => onTab(c.goTo)} aria-pressed={tab === c.goTo && c.goTo !== "all"}
            initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.06 }}
            className={clsx("group rounded-2xl border p-4 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5", tone.card)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-navy">{c.label}</p>
                <p className={clsx("mt-1.5 text-3xl font-bold leading-none sm:text-[2rem]", tone.num)}><CountUp value={c.value} format={n} /></p>
                <p className="mt-2 text-xs text-slate-600">{c.sub}</p>
              </div>
              <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105", tone.chip)}><Icon className="size-5" /></span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
