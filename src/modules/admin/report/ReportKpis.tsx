"use client";

import { AlertTriangle, Banknote, Rocket, RefreshCw, Users, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount, formatTaka } from "../dashboard/format";
import type { ReportSummary } from "./types";

interface Props { data: ReportSummary | null; state: "loading" | "ready" | "error"; fetching: boolean; onRetry: () => void }

/** Paid subscribers and money for the chosen dates: everyone's total, plan money, boost money. */
export function ReportKpis({ data, state, fetching, onRetry }: Props) {
  const t = useTranslations("admin.report.kpi");
  const locale = useLocale();
  const taka = formatTaka(locale), count = formatCount(locale);

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const sub = t("period");
  const cards: Omit<CardProps, "index">[] = [
    { tone: "pink", icon: Users, label: t("subscribers"), value: data.paidSubscribers, format: count, sub },
    { tone: "green", icon: Wallet, label: t("total"), value: Number(data.totalPaid), format: taka, sub },
    { tone: "sky", icon: Banknote, label: t("subscriptions"), value: Number(data.subscription.amount), format: taka, sub: t("payments", { n: count(data.subscription.payments) }) },
    { tone: "amber", icon: Rocket, label: t("boost"), value: Number(data.boost.amount), format: taka, sub: t("payments", { n: count(data.boost.payments) }) },
  ];
  return <div className={`grid gap-4 sm:grid-cols-2 ${fetching ? "motion-safe:animate-pulse" : ""}`}>{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
