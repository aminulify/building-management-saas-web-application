"use client";

import { AlertTriangle, CheckCircle2, Flag, RefreshCw, ShieldAlert, Star, Store, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { HomeStats } from "../manage-home/types";
import { KpiCard, type CardProps } from "../shared/KpiCard";

interface Props { data: HomeStats | null; state: "loading" | "ready" | "error"; onRetry: () => void }

/** Six numbers of the buy / sell marketplace, counted in the database (3 columns on wide screens). */
export function MarketKpis({ data, state, onRetry }: Props) {
  const t = useTranslations("admin.manageMarket.kpi");
  const locale = useLocale();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 0, useGrouping: false }).format(Math.round(n));

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const cards: Omit<CardProps, "index">[] = [
    { tone: "green", icon: Store, label: t("total"), value: data.total, format: num, sub: t("totalSub", { sold: num(data.sold) }) },
    { tone: "purple", icon: CheckCircle2, label: t("active"), value: data.active, format: num, sub: t("activeSub") },
    { tone: "sky", icon: ShieldAlert, label: t("pending"), value: data.pending, format: num, sub: t("pendingSub") },
    { tone: "red", icon: Flag, label: t("reported"), value: data.reported, format: num, sub: t("reportedSub"), dot: data.reported > 0 },
    { tone: "orange", icon: XCircle, label: t("rejected"), value: data.rejected, format: num, sub: t("rejectedSub") },
    { tone: "amber", icon: Star, label: t("featured"), value: data.featured, format: num, sub: t("featuredSub") },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
