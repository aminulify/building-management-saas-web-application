"use client";

import { Banknote, Building2, DoorOpen, TrendingUp, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { Link } from "@/i18n/navigation";
import { formatNumber, formatPercent, formatTaka } from "./format";
import { SectionError } from "./SectionState";
import type { OwnerOverview, OwnerStats } from "./types";

type Tone = "sky" | "blue" | "red" | "amber" | "green" | "pink";

/** Tint cards: border, soft fill, number colour and icon chip per tone (status palette of docs/design-system.md). */
const TONE: Record<Tone, { card: string; num: string; chip: string }> = {
  sky: { card: "border-sky-300 bg-sky-100/60", num: "text-sky-500", chip: "border-sky-300 bg-sky-200/70 text-sky-500" },
  blue: { card: "border-blue-300 bg-blue-100/60", num: "text-blue-600", chip: "border-blue-300 bg-blue-200/70 text-blue-600" },
  red: { card: "border-red-300 bg-red-100/60", num: "text-red-700", chip: "border-red-300 bg-red-200/70 text-red-700" },
  amber: { card: "border-amber-300 bg-amber-100/60", num: "text-amber-500", chip: "border-amber-300 bg-amber-200/70 text-amber-600" },
  green: { card: "border-emerald-300 bg-emerald-100/60", num: "text-emerald-600", chip: "border-emerald-300 bg-emerald-200/70 text-emerald-600" },
  pink: { card: "border-fuchsia-300 bg-fuchsia-100/60", num: "text-fuchsia-500", chip: "border-fuchsia-300 bg-fuchsia-200/70 text-fuchsia-500" },
};

interface CardProps { tone: Tone; icon: LucideIcon; label: string; value: number; format: (n: number) => string; sub: string; href: string; index: number }

function StatCard({ tone, icon: Icon, label, value, format, sub, href, index }: CardProps) {
  const reduce = useReducedMotion();
  const c = TONE[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.06 }}
    >
      <Link
        href={href as never}
        className={clsx("group block rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5", c.card)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">{label}</p>
            <p className={clsx("mt-1.5 text-3xl font-bold leading-none sm:text-[2rem]", c.num)}><CountUp value={value} format={format} /></p>
            <p className="mt-2 text-xs text-slate-600">{sub}</p>
          </div>
          <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl border transition-transform duration-300 group-hover:scale-105", c.chip)}><Icon className="size-5" /></span>
        </div>
      </Link>
    </motion.div>
  );
}

interface Props {
  overview: OwnerOverview | null; stats: OwnerStats | null;
  state: "loading" | "ready" | "error"; onRetry: () => void;
}

export function StatCards({ overview, stats, state, onRetry }: Props) {
  const t = useTranslations("owner.cards");
  const locale = useLocale();
  const num = formatNumber(locale), taka = formatTaka(locale), pct = formatPercent(locale);

  if (state === "error") return <SectionError onRetry={onRetry} />;
  if (state === "loading" || !overview || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}
      </div>
    );
  }

  const { portfolio, rentThisMonth } = overview;
  const occupied = portfolio.units.OCCUPIED ?? 0;
  const cards: Omit<CardProps, "index">[] = [
    { tone: "sky", icon: Building2, label: t("properties"), value: portfolio.properties, format: num, sub: t("propertiesSub", { n: portfolio.activeTenants }), href: "/owner/properties" },
    { tone: "blue", icon: DoorOpen, label: t("units"), value: portfolio.totalUnits, format: num, sub: t("unitsSub", { occupied: num(occupied), vacant: num(portfolio.totalUnits - occupied) }), href: "/owner/units" },
    { tone: "red", icon: Wallet, label: t("unpaid"), value: stats.unpaidUnitsLast30Days, format: num, sub: t("unpaidSub"), href: "/owner/rent" },
    { tone: "amber", icon: Wrench, label: t("maintenance"), value: stats.maintenance.solvedRate, format: pct, sub: t("maintenanceSub", { solved: num(stats.maintenance.solved), total: num(stats.maintenance.total) }), href: "/owner/maintenance" },
    { tone: "green", icon: Banknote, label: t("totalRent"), value: Number(rentThisMonth.expected), format: taka, sub: t("totalRentSub", { collected: taka(Number(rentThisMonth.collected)) }), href: "/owner/rent" },
    { tone: "pink", icon: TrendingUp, label: t("rentPaid"), value: rentThisMonth.collectionRate, format: pct, sub: t("rentPaidSub", { outstanding: taka(Number(rentThisMonth.outstanding)) }), href: "/owner/rent" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c, i) => <StatCard key={c.label} index={i} {...c} />)}
    </div>
  );
}
