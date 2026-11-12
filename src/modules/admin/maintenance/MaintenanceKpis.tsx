"use client";

import { AlertTriangle, ClipboardList, Hourglass, RefreshCw, Siren, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount } from "../dashboard/format";
import type { MaintStats } from "./types";

interface Props { data: MaintStats | null; state: "loading" | "ready" | "error"; fetching: boolean; onRetry: () => void }

/** Total, open, critical and the average days to fix, for the chosen dates. */
export function MaintenanceKpis({ data, state, fetching, onRetry }: Props) {
  const t = useTranslations("admin.maintenance.kpi");
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
  if (!data) return <div className="grid gap-4 sm:grid-cols-2" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const days = data.avgResolutionDays;
  const oneDecimal = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const cards: Omit<CardProps, "index">[] = [
    { tone: "purple", icon: ClipboardList, label: t("total"), value: data.total, format: count, sub: t("totalSub") },
    { tone: "sky", icon: Hourglass, label: t("open"), value: data.open, format: count, sub: t("openSub") },
    { tone: "red", icon: Siren, label: t("critical"), value: data.critical, format: count, sub: t("criticalSub"), dot: data.critical > 0 },
    { tone: "green", icon: Timer, label: t("avg"), value: days ?? 0, format: (n) => (days == null ? "—" : t("days", { n: oneDecimal(n) })), sub: days == null ? t("avgNone") : t("avgSub", { n: count(data.resolvedCount) }) },
  ];
  return <div className={`grid gap-4 sm:grid-cols-2 ${fetching ? "motion-safe:animate-pulse" : ""}`}>{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
