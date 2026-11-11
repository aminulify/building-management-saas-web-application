"use client";

import { AlertTriangle, Banknote, Home, RefreshCw, User, UserCheck, UserPlus, UserX, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatCount, formatDay, formatTaka } from "./format";
import type { AdminKpis } from "./types";

type Tone = "purple" | "blue" | "yellow" | "green" | "sky" | "red";

/** Border, soft fill, number colour and icon chip per card (status palette of docs/design-system.md). */
const TONE: Record<Tone, { card: string; num: string; chip: string }> = {
  purple: { card: "border-violet-300 bg-violet-100/60", num: "text-violet-600", chip: "border-violet-300 bg-violet-200/70 text-violet-600" },
  blue: { card: "border-blue-300 bg-blue-100/60", num: "text-blue-600", chip: "border-blue-300 bg-blue-200/70 text-blue-600" },
  yellow: { card: "border-yellow-300 bg-yellow-100/60", num: "text-yellow-600", chip: "border-yellow-300 bg-yellow-200/70 text-yellow-600" },
  green: { card: "border-emerald-300 bg-emerald-100/60", num: "text-emerald-600", chip: "border-emerald-300 bg-emerald-200/70 text-emerald-600" },
  sky: { card: "border-sky-300 bg-sky-100/60", num: "text-sky-500", chip: "border-sky-300 bg-sky-200/70 text-sky-500" },
  red: { card: "border-red-300 bg-red-100/60", num: "text-red-700", chip: "border-red-300 bg-red-200/70 text-red-700" },
};

interface CardProps { tone: Tone; icon: LucideIcon; label: string; value: number; format: (n: number) => string; sub: string; index: number; busy?: boolean }

function KpiCard({ tone, icon: Icon, label, value, format, sub, index, busy }: CardProps) {
  const reduce = useReducedMotion();
  const c = TONE[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.06 }}
      className={clsx("group rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5", c.card, busy && "motion-safe:animate-pulse")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-slate-600">{label}</p>
          <p className={clsx("mt-2 text-3xl font-bold leading-none sm:text-[2rem]", c.num)}><CountUp value={value} format={format} /></p>
          <p className="mt-2 text-xs text-slate-600">{sub}</p>
        </div>
        <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105", c.chip)}><Icon className="size-5" /></span>
      </div>
    </motion.div>
  );
}

interface Props { data: AdminKpis | null; state: "loading" | "ready" | "error"; fetching: boolean; onRetry: () => void }

/** Six platform numbers in a 3 × 2 grid (2 × 3 on tablets). Everything is counted from the database. */
export function KpiCards({ data, state, fetching, onRetry }: Props) {
  const t = useTranslations("admin.dashboard.kpi");
  const locale = useLocale();

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[124px] rounded-2xl" />)}
      </div>
    );
  }

  const num = formatCount(locale), taka = formatTaka(locale);
  const cards: Omit<CardProps, "index">[] = [
    { tone: "purple", icon: Banknote, label: t("revenue"), value: Number(data.revenue.amount), format: taka, sub: t("revenueSub", { n: num(data.revenue.payments), from: formatDay(locale, data.range.from), to: formatDay(locale, data.range.to) }), busy: fetching },
    { tone: "blue", icon: User, label: t("owners"), value: data.totalOwners, format: num, sub: t("ownersSub") },
    { tone: "yellow", icon: Home, label: t("properties"), value: data.propertiesManaged, format: num, sub: t("propertiesSub") },
    { tone: "green", icon: UserPlus, label: t("tenants"), value: data.activeTenants, format: num, sub: t("tenantsSub") },
    { tone: "sky", icon: UserCheck, label: t("paid"), value: data.paidOwners, format: num, sub: t("paidSub") },
    { tone: "red", icon: UserX, label: t("unpaid"), value: data.unpaidOwners, format: num, sub: t("unpaidSub") },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}
    </div>
  );
}
