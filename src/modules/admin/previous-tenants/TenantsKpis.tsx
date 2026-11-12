"use client";

import { AlertTriangle, Archive, CalendarClock, CheckCircle2, LogOut, RefreshCw, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount, formatTaka } from "../dashboard/format";
import type { ArchiveStats } from "./types";

interface Props { data: ArchiveStats | null; state: "loading" | "ready" | "error"; fetching: boolean; onRetry: () => void }

/** Archived total, rent unpaid, average tenancy, plus the unpaid money, settled records and the last 30 days. */
export function TenantsKpis({ data, state, fetching, onRetry }: Props) {
  const t = useTranslations("admin.previousTenants.kpi");
  const locale = useLocale();
  const count = formatCount(locale);

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const years = (n: number) => t("years", { n: new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) });
  const cards: Omit<CardProps, "index">[] = [
    { tone: "amber", icon: Archive, label: t("total"), value: data.total, format: count, sub: t("totalSub") },
    { tone: "red", icon: AlertTriangle, label: t("unpaid"), value: data.unpaid, format: count, sub: t("unpaidSub") },
    { tone: "green", icon: CalendarClock, label: t("avg"), value: data.avgYears, format: years, sub: t("avgSub") },
    { tone: "orange", icon: Wallet, label: t("amount"), value: data.unpaidAmount, format: formatTaka(locale), sub: t("amountSub") },
    { tone: "sky", icon: CheckCircle2, label: t("cleared"), value: data.cleared, format: count, sub: t("clearedSub") },
    { tone: "purple", icon: LogOut, label: t("recent"), value: data.movedOutRecently, format: count, sub: t("recentSub") },
  ];
  return <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${fetching ? "motion-safe:animate-pulse" : ""}`}>{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
