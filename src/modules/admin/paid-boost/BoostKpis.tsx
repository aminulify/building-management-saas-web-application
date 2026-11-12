"use client";

import { AlertTriangle, Banknote, Hourglass, RefreshCw, Rocket, XCircle, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import type { BoostStats } from "./types";

interface Props { data: BoostStats | null; state: "loading" | "ready" | "error"; onRetry: () => void }

/** Pending review, running, finished, refused, and the money collected (verified bKash payments). */
export function BoostKpis({ data, state, onRetry }: Props) {
  const t = useTranslations("admin.paidBoost.kpi");
  const locale = useLocale();
  const tag = locale === "bn" ? "bn-BD" : "en-IN";
  const num = (n: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: 0, useGrouping: false }).format(Math.round(n));
  const taka = (n: number) => `৳ ${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.round(n))}`;

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const cards: Omit<CardProps, "index">[] = [
    { tone: "sky", icon: Zap, label: t("total"), value: data.total, format: num, sub: data.pending > 0 ? t("totalSubPending", { n: num(data.pending) }) : t("totalSub"), dot: data.pending > 0 },
    { tone: "purple", icon: Banknote, label: t("paid"), value: Number(data.revenue), format: taka, sub: t("paidSub", { n: num(data.paidCount) }) },
    { tone: "orange", icon: XCircle, label: t("failed"), value: data.failed, format: num, sub: t("failedSub") },
    { tone: "green", icon: Rocket, label: t("active"), value: data.active, format: num, sub: t("activeSub") },
    { tone: "gray", icon: Hourglass, label: t("expired"), value: data.expired, format: num, sub: t("expiredSub") },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
