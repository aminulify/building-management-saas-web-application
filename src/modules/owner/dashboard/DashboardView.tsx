"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { buttonClass } from "@/components/glass/GradientButton";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";
import { useOwner } from "../shell/OwnerContext";
import { ActivityFeed } from "./ActivityFeed";
import { EmergencyModal } from "./EmergencyModal";
import { EmergencyStrip, type Service } from "./EmergencyStrip";
import { Insights } from "./Insights";
import { QuickActions } from "./QuickActions";
import { RevenueChart } from "./RevenueChart";
import { StatCards } from "./StatCards";
import type { OwnerActivities, OwnerOverview, OwnerRevenue, OwnerStats } from "./types";

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }}>
      {children}
    </motion.div>
  );
}

export function DashboardView() {
  const t = useTranslations("owner.dashboard");
  const locale = useLocale();
  const { me, refreshUnread } = useOwner();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [limit, setLimit] = useState(8);
  const [service, setService] = useState<Service | null>(null);

  const overview = useAuthQuery<OwnerOverview>("/dashboard/owner");
  const stats = useAuthQuery<OwnerStats>("/dashboard/owner/stats");
  const revenue = useAuthQuery<OwnerRevenue>(`/dashboard/owner/revenue?year=${year}`);
  const activities = useAuthQuery<OwnerActivities>(`/dashboard/owner/activities?limit=${limit}`);

  const cardsState = overview.state === "error" || stats.state === "error" ? "error" : overview.state === "ready" && stats.state === "ready" ? "ready" : "loading";
  const firstName = me.fullName.split(/\s+/)[0] ?? me.fullName;
  const today = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const noProperties = overview.state === "ready" && overview.data?.portfolio.properties === 0;

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.6rem] font-bold leading-snug text-navy sm:text-[1.9rem]">{t.rich("title", { name: firstName, hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")} <span className="text-label">· {today}</span></p>
      </FadeIn>

      {noProperties && (
        <Reveal>
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-5 sm:flex-row sm:items-center">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-sky-200/70 text-sky-600"><Building2 className="size-6" /></span>
            <div className="flex-1"><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t("emptyText")}</p></div>
            <Link href={"/home-owner/properties" as never} className={`${buttonClass("primary")} h-11 shrink-0`}><Plus className="size-4" aria-hidden />{t("emptyCta")}</Link>
          </div>
        </Reveal>
      )}

      <StatCards overview={overview.data} stats={stats.data} state={cardsState} onRetry={() => { overview.reload(); stats.reload(); }} />

      {overview.state === "ready" && overview.data && <Reveal><Insights overview={overview.data} /></Reveal>}

      <Reveal>
        <RevenueChart data={revenue.data} state={revenue.state} fetching={revenue.fetching} year={year} onYear={setYear} onRetry={revenue.reload} />
      </Reveal>

      <Reveal>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <QuickActions />
          <ActivityFeed data={activities.data} state={activities.state} fetching={activities.fetching} onMore={() => setLimit((n) => n + 8)} onRetry={activities.reload} />
        </div>
      </Reveal>

      <Reveal><EmergencyStrip onOpen={setService} /></Reveal>

      <EmergencyModal service={service} onClose={() => setService(null)} onSent={() => { activities.reload(); refreshUnread(); }} />
    </div>
  );
}
