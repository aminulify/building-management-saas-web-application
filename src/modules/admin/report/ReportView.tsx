"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useAuthQuery } from "@/lib/use-auth-query";
import { dhakaToday } from "../../dashboards/admin-range";
import { ExportInvoiceButton } from "./ExportInvoiceButton";
import { DateRange } from "../dashboard/DateRange";
import { PlansMeter } from "./PlansMeter";
import { ReportKpis } from "./ReportKpis";
import { RevenueChart } from "./RevenueChart";
import { TransactionsTable } from "./TransactionsTable";
import type { ReportPlans, ReportRevenue, ReportSummary, TxnFilter } from "./types";
import { useTransactions } from "./use-transactions";

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }}>{children}</motion.div>;
}

const daysBefore = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Super Admin → Report: money and subscribers for the chosen dates, a year of revenue, plan popularity and the latest transactions. */
export function ReportView() {
  const t = useTranslations("admin.report");
  const [range, setRange] = useState(() => { const to = dhakaToday(); return { from: daysBefore(to, 29), to }; });
  const [year, setYear] = useState<number | null>(null);
  const [filter, setFilter] = useState<TxnFilter>("all");
  const [plan, setPlan] = useState("ALL");
  const invalid = !range.from || !range.to || range.from > range.to;
  const summaryPath = useMemo(() => (invalid ? null : `/admin/report/summary?from=${range.from}&to=${range.to}`), [invalid, range]);
  const summary = useAuthQuery<ReportSummary>(summaryPath);
  const revenue = useAuthQuery<ReportRevenue>(year ? `/admin/report/revenue?year=${year}` : "/admin/report/revenue");
  const plans = useAuthQuery<ReportPlans>("/admin/report/plans");
  const txns = useTransactions(filter, plan);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.08} className="flex flex-wrap items-start gap-3"><DateRange from={range.from} to={range.to} invalid={invalid} fetching={summary.fetching} onChange={setRange} /><ExportInvoiceButton from={range.from} to={range.to} disabled={invalid} /></FadeIn>
      </div>

      <ReportKpis data={summary.data} state={summary.state} fetching={summary.fetching} onRetry={summary.reload} />
      <Reveal><RevenueChart data={revenue.data} state={revenue.state} fetching={revenue.fetching} year={year} onYear={setYear} onRetry={revenue.reload} /></Reveal>
      <Reveal><PlansMeter data={plans.data} state={plans.state} onRetry={plans.reload} /></Reveal>
      <Reveal><TransactionsTable filter={filter} onFilter={setFilter} plan={plan} onPlan={setPlan} plans={plans.data} pages={txns} /></Reveal>
    </div>
  );
}
