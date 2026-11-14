"use client";

import { AlertTriangle, BadgeCheck, Building2, DoorOpen, Flag, PieChart, RefreshCw, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../../admin/shared/KpiCard";
import type { GovStats } from "./types";

interface Props { data: GovStats | null; state: "loading" | "ready" | "error"; onRetry: () => void }

/** The four numbers of the design, then four more a regulator needs: approved, rejected, new this month, flagged. */
export function GovKpis({ data, state, onRetry }: Props) {
  const t = useTranslations("gov.properties.kpi");
  const locale = useLocale();
  const tag = locale === "bn" ? "bn-BD" : "en-IN";
  const num = (n: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.round(n));
  const pct = (n: number) => `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10)}%`;

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const cards: Omit<CardProps, "index">[] = [
    { tone: "green", icon: Building2, label: t("total"), value: data.totalProperties, format: num, sub: t("totalSub", { n: num(data.newThisMonth) }) },
    { tone: "blue", icon: DoorOpen, label: t("units"), value: data.totalUnits, format: num, sub: t("unitsSub", { n: num(data.vacantUnits) }) },
    { tone: "purple", icon: PieChart, label: t("occupancy"), value: data.occupancyRate, format: pct, sub: t("occupancySub", { occupied: num(data.occupiedUnits), vacant: num(data.vacantUnits) }) },
    { tone: "gray", icon: ShieldAlert, label: t("pending"), value: data.pendingApproval, format: num, sub: t("pendingSub"), dot: data.pendingApproval > 0 },
    { tone: "sky", icon: BadgeCheck, label: t("verified"), value: data.verified, format: num, sub: t("verifiedSub") },
    { tone: "red", icon: XCircle, label: t("rejected"), value: data.rejected, format: num, sub: t("rejectedSub", { n: num(data.suspended) }) },
    { tone: "amber", icon: Sparkles, label: t("fresh"), value: data.newThisMonth, format: num, sub: t("freshSub") },
    { tone: "orange", icon: Flag, label: t("flagged"), value: data.flaggedLast30, format: num, sub: t("flaggedSub") },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
