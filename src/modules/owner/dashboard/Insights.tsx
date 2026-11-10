"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, PieChart } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber, formatPercent } from "./format";
import type { OwnerOverview } from "./types";

function Bar({ value, tone }: { value: number; tone: "blue" | "amber" | "red" }) {
  const reduce = useReducedMotion();
  const fill = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-400" : "bg-brand-gradient";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200/80" role="presentation">
      <motion.div className={clsx("h-full origin-left rounded-full", fill)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6 }} />
    </div>
  );
}

/** Three quick health checks for the portfolio: occupancy, plan usage, and what needs attention. */
export function Insights({ overview }: { overview: OwnerOverview }) {
  const t = useTranslations("owner.insights");
  const locale = useLocale();
  const num = formatNumber(locale), pct = formatPercent(locale);
  const { portfolio, subscription, overdueRecords } = overview;
  const noPlan = subscription.status === "NONE";
  const unitLimit = subscription.limits.unitLimit;
  const unitUse = unitLimit > 0 ? (subscription.usage.units * 100) / unitLimit : 0;
  const attention = [
    overdueRecords > 0 && { key: "overdue", icon: AlertTriangle, text: t("overdue", { n: num(overdueRecords) }), href: "/owner/rent", tone: "text-red-700" },
    portfolio.leasesExpiringIn60Days > 0 && { key: "leases", icon: CalendarClock, text: t("leases", { n: num(portfolio.leasesExpiringIn60Days) }), href: "/owner/tenants", tone: "text-amber-700" },
  ].filter(Boolean) as { key: string; icon: typeof AlertTriangle; text: string; href: string; tone: string }[];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md" aria-labelledby="ins-occ">
        <h3 id="ins-occ" className="flex items-center gap-2 text-sm font-semibold text-navy"><PieChart className="size-4 text-sky-500" aria-hidden />{t("occupancy")}</h3>
        <p className="mt-2 text-2xl font-bold text-navy">{pct(portfolio.occupancyRate)}</p>
        <div className="mt-2"><Bar value={portfolio.occupancyRate} tone="blue" /></div>
        <p className="mt-2 text-xs text-slate-600">{t("occupancySub", { n: num(portfolio.activeTenants) })}</p>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md" aria-labelledby="ins-plan">
        <h3 id="ins-plan" className="flex items-center gap-2 text-sm font-semibold text-navy"><CreditCard className="size-4 text-fuchsia-500" aria-hidden />{t("plan")}</h3>
        {noPlan ? (
          <>
            <p className="mt-2 text-sm font-medium text-amber-700">{t("noPlan")}</p>
            <Link href={"/owner/subscription" as never} className="mt-3 inline-block text-sm font-bold text-[#00AEEF] underline-offset-4 hover:underline">{t("choosePlan")}</Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-2xl font-bold text-navy">{num(subscription.usage.units)}<span className="text-base font-medium text-label"> / {num(unitLimit)}</span></p>
            <div className="mt-2"><Bar value={unitUse} tone={unitUse >= 100 ? "red" : unitUse >= 80 ? "amber" : "blue"} /></div>
            <p className="mt-2 text-xs text-slate-600">{unitUse >= 80 ? t("planNearLimit") : t("planSub", { n: num(subscription.usage.properties), limit: num(subscription.limits.propertyLimit) })}</p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md" aria-labelledby="ins-att">
        <h3 id="ins-att" className="flex items-center gap-2 text-sm font-semibold text-navy"><AlertTriangle className="size-4 text-amber-500" aria-hidden />{t("attention")}</h3>
        {attention.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-5" aria-hidden />{t("allClear")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attention.map(({ key, icon: Icon, text, href, tone }) => (
              <li key={key}><Link href={href as never} className={clsx("flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline", tone)}><Icon className="size-4 shrink-0" aria-hidden />{text}</Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
