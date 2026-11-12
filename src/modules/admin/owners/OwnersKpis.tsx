"use client";

import { AlertTriangle, Building2, RefreshCw, Sparkles, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount } from "../dashboard/format";
import type { OwnerStats } from "./types";

interface Props { data: OwnerStats | null; state: "loading" | "ready" | "error"; fetching: boolean; mode: "rental" | "market"; onRetry: () => void }

/** Total owners, what they manage (and the average per owner), and what is new in the chosen dates. */
export function OwnersKpis({ data, state, fetching, mode, onRetry }: Props) {
  const t = useTranslations("admin.owners.kpi");
  const locale = useLocale();
  const count = formatCount(locale);
  const one = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 1 }).format(n);

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const m = mode === "market" ? "market" : "rental";
  const cards: Omit<CardProps, "index">[] = [
    { tone: "green", icon: Users, label: t("owners"), value: data.totalOwners, format: count, sub: t(`${m}.ownersSub`) },
    { tone: "sky", icon: Building2, label: t(`${m}.total`), value: data.total, format: count, sub: t(`${m}.avg`, { n: one(data.average) }) },
    { tone: "purple", icon: Sparkles, label: t(`${m}.fresh`), value: data.fresh, format: count, sub: t("period", { from: data.range.from, to: data.range.to }) },
  ];
  return <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${fetching ? "motion-safe:animate-pulse" : ""}`}>{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
