"use client";

import { AlertTriangle, DollarSign, TriangleAlert, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber, formatTaka } from "../dashboard/format";
import { monthLabel } from "./period";
import type { LedgerStats } from "./types";

const TONE = {
  green: { card: "border-emerald-400 bg-emerald-50/70", num: "text-emerald-600", chip: "border-emerald-300 bg-emerald-100 text-emerald-600" },
  yellow: { card: "border-yellow-400 bg-yellow-50/70", num: "text-yellow-500", chip: "border-yellow-300 bg-yellow-100 text-yellow-600" },
  red: { card: "border-red-400 bg-red-50/70", num: "text-red-600", chip: "border-red-300 bg-red-100 text-red-600" },
} as const;

interface Props { stats: LedgerStats | null; month: string }

/** Total Paid / Payment Pending / Overdue Payment for the selected month and property. */
export function RentStats({ stats, month }: Props) {
  const t = useTranslations("owner.rent.stats");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const taka = formatTaka(locale), n = formatNumber(locale);

  if (!stats) return <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const label = monthLabel(locale, month);
  const cards: { key: string; tone: keyof typeof TONE; icon: LucideIcon; value: number; format: (v: number) => string; title: string; sub: string; extra?: React.ReactNode }[] = [
    {
      key: "paid", tone: "green", icon: DollarSign, value: Number(stats.collected), format: taka, title: t("paid"), sub: label,
      extra: (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-emerald-200/70" role="presentation">
            <motion.div className="h-full origin-left rounded-full bg-emerald-500" style={{ width: `${Math.min(100, stats.collectionRate)}%` }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6 }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-600">{t("collectedOf", { rate: n(stats.collectionRate), expected: taka(Number(stats.expected)) })}</p>
        </div>
      ),
    },
    { key: "pending", tone: "yellow", icon: AlertTriangle, value: Number(stats.pending), format: taka, title: t("pending"), sub: label },
    { key: "overdue", tone: "red", icon: TriangleAlert, value: stats.overdueCount, format: n, title: t("overdue"), sub: stats.overdueCount > 0 ? t("overdueSub", { amount: taka(Number(stats.overdueAmount)) }) : t("overdueNone") },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c, i) => {
        const tone = TONE[c.tone];
        const Icon = c.icon;
        return (
          <motion.div
            key={c.key} initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.06 }}
            className={clsx("group rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5", tone.card)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{c.title}</p>
                <p className={clsx("mt-1.5 truncate text-3xl font-bold leading-none sm:text-[2rem]", tone.num)}><CountUp value={c.value} format={c.format} /></p>
                <p className="mt-2 text-xs text-slate-600">{c.sub}</p>
              </div>
              <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105", tone.chip)}><Icon className="size-5" /></span>
            </div>
            {c.extra}
          </motion.div>
        );
      })}
    </div>
  );
}
