"use client";

import { AlertTriangle, Award, Banknote, CalendarClock, CheckCircle2, RefreshCw, Rocket, Star, TimerOff, UserPlus, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount, formatTaka } from "../dashboard/format";
import type { SubStats } from "./types";

interface Props { data: SubStats | null; state: "loading" | "ready" | "error"; onRetry: () => void }

/** Nine cards: active owners, one per package, expired, expiring soon, boosts, new buyers of the week and this month's plan money. */
export function SubKpis({ data, state, onRetry }: Props) {
  const t = useTranslations("admin.subs.kpi");
  const locale = useLocale();
  const count = formatCount(locale), taka = formatTaka(locale);

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const cards: Omit<CardProps, "index">[] = [
    { tone: "green", icon: CheckCircle2, label: t("active"), value: data.active, format: count, sub: t("activeSub", { n: count(data.newThisWeek) }) },
    { tone: "amber", icon: Zap, label: t("billionaire"), value: data.plans.BILLIONAIRE, format: count, sub: t("billionaireSub") },
    { tone: "pink", icon: Award, label: t("millionaire"), value: data.plans.MILLIONAIRE, format: count, sub: t("millionaireSub") },
    { tone: "sky", icon: Star, label: t("primary"), value: data.plans.PRIMARY, format: count, sub: t("primarySub") },
    { tone: "red", icon: TimerOff, label: t("expired"), value: data.expired, format: count, sub: t("attention"), dot: data.expired > 0 },
    { tone: "amber", icon: CalendarClock, label: t("expiring"), value: data.expiring, format: count, sub: t("expiringSub", { n: data.expiringDays }), dot: data.expiring > 0 },
    { tone: "purple", icon: Rocket, label: t("boost"), value: data.boost.active, format: count, sub: t("boostSub", { n: count(data.boost.paid), amount: taka(Number(data.boost.revenue)) }) },
    { tone: "orange", icon: UserPlus, label: t("buyers"), value: data.newThisWeek, format: count, sub: t("buyersSub") },
    { tone: "green", icon: Banknote, label: t("revenue"), value: Number(data.revenueMonth.amount), format: taka, sub: t("revenueSub", { n: count(data.revenueMonth.payments) }) },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
