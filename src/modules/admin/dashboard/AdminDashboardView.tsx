"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useAuthQuery } from "@/lib/use-auth-query";
import { dhakaMonthStart, dhakaToday } from "../../dashboards/admin-range";
import { ActivePlans } from "./ActivePlans";
import { DateRange } from "./DateRange";
import { KpiCards } from "./KpiCards";
import type { AdminKpis } from "./types";

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }}>
      {children}
    </motion.div>
  );
}

/** Platform Overview: the dates choose the revenue period, the six cards and the Active Plans list come straight from the database. */
export function AdminDashboardView() {
  const t = useTranslations("admin.dashboard");
  const [range, setRange] = useState(() => ({ from: dhakaMonthStart(), to: dhakaToday() }));
  const invalid = !range.from || !range.to || range.from > range.to;
  const path = useMemo(() => (invalid ? null : `/dashboard/admin/kpis?from=${range.from}&to=${range.to}`), [invalid, range]);
  const kpis = useAuthQuery<AdminKpis>(path);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.08}><DateRange from={range.from} to={range.to} invalid={invalid} fetching={kpis.fetching} onChange={setRange} /></FadeIn>
      </div>

      <KpiCards data={kpis.data} state={kpis.state} fetching={kpis.fetching} onRetry={kpis.reload} />

      <Reveal><ActivePlans /></Reveal>
    </div>
  );
}
