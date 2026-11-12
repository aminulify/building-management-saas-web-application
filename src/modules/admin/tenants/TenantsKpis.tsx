"use client";

import { AlertTriangle, CalendarClock, FileCheck2, RefreshCw, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { KpiCard, type CardProps } from "../shared/KpiCard";
import { formatCount } from "../dashboard/format";
import type { TenantStats } from "./types";

interface Props { data: TenantStats | null; state: "loading" | "ready" | "error"; onRetry: () => void }

/** Total tenants, running leases with their share, and leases ending within 30 days. Everything is counted from the database. */
export function TenantsKpis({ data, state, onRetry }: Props) {
  const t = useTranslations("admin.tenants.kpi");
  const locale = useLocale();
  const count = formatCount(locale);
  const pct = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 1 }).format(n);

  if (state === "error" && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
        <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
        <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}</div>;

  const cards: Omit<CardProps, "index">[] = [
    { tone: "green", icon: Users, label: t("total"), value: data.totalTenants, format: count, sub: t("totalSub", { n: count(data.newLast30) }) },
    { tone: "sky", icon: FileCheck2, label: t("leases"), value: data.activeLeases, format: count, sub: t("leasesSub", { n: pct(data.activeRate) }) },
    { tone: "amber", icon: CalendarClock, label: t("expiring"), value: data.expiringSoon, format: count, sub: t("expiringSub"), dot: data.expiringSoon > 0 },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <KpiCard key={c.label} index={i} {...c} />)}</div>;
}
