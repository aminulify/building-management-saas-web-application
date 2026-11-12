"use client";

import { AlertTriangle, Archive, Ban, History, PauseCircle, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount } from "../dashboard/format";
import type { ArchiveStats } from "./types";

interface Props { data: ArchiveStats | null; state: "loading" | "ready" | "error"; fetching: boolean; onRetry: () => void }

/** Total archived, banned, inactive, deleted, plus every record and what came back in the last 30 days. */
export function OwnersKpis({ data, state, fetching, onRetry }: Props) {
  const t = useTranslations("admin.previousOwners.kpi");
  const count = formatCount(useLocale());

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
    { tone: "amber", icon: Archive, label: t("archived"), value: data.archived, format: count, sub: t("archivedSub") },
    { tone: "red", icon: Ban, label: t("banned"), value: data.banned, format: count, sub: t("bannedSub") },
    { tone: "green", icon: PauseCircle, label: t("inactive"), value: data.inactive, format: count, sub: t("inactiveSub") },
    { tone: "gray", icon: Trash2, label: t("deleted"), value: data.deleted, format: count, sub: t("deletedSub") },
    { tone: "sky", icon: History, label: t("total"), value: data.total, format: count, sub: t("totalSub") },
    { tone: "purple", icon: RefreshCw, label: t("reactivated"), value: data.reactivated, format: count, sub: t("reactivatedSub") },
  ];
  return <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${fetching ? "motion-safe:animate-pulse" : ""}`}>{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
