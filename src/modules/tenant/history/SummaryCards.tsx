"use client";

import { AlertCircle, CalendarDays, CheckCircle2, Home } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { oneDecimal, padded, takaSpaced, UNPAID_STYLE } from "./logic";
import type { HistorySummary } from "./types";

const card = "relative flex min-h-[8.5rem] flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.28)] motion-reduce:hover:translate-y-0";

/** Years rented, properties lived in and the unpaid balance (red after the 5th, green when all is paid). */
export function SummaryCards({ s }: { s: HistorySummary }) {
  const t = useTranslations("tenant.history.summary");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const u = UNPAID_STYLE[s.unpaid.state];
  const amount = Number(s.unpaid.amount);
  const motionProps = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.45, delay: reduce ? 0 : i * 0.07 } });

  return (
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t("aria")}>
      <motion.div {...motionProps(0)} className={clsx(card, "border-sky-300 bg-gradient-to-br from-[#EFF6FF] to-sky-50/60")}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-navy">{t("years")}</p>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#DBEAFE] text-[#0A84F0]"><CalendarDays className="size-5" /></span>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-[#0A84F0]"><CountUp value={s.yearsRented} format={(n) => t("yearsValue", { n: oneDecimal(locale)(n) })} /></p>
          <p className="mt-0.5 text-xs text-slate-500">{s.since ? t("since", { month: new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(s.since)) }) : t("noStay")}</p>
        </div>
      </motion.div>

      <motion.div {...motionProps(1)} className={clsx(card, "border-green-300 bg-gradient-to-br from-[#F0FDF4] to-emerald-50/60")}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-navy">{t("houses")}</p>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#DCFCE7] text-green-600"><Home className="size-5" /></span>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-green-600"><CountUp value={s.properties} format={(n) => t("housesValue", { n: padded(locale, Math.round(n)), count: s.properties })} /></p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={s.propertyNames.join(", ")}>{s.propertyNames.length ? s.propertyNames.join(` ${t("and")} `) : t("noStay")}</p>
        </div>
      </motion.div>

      <motion.div {...motionProps(2)} className={clsx(card, u.card)} aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-navy">{t("unpaid")}</p>
          <span aria-hidden className={clsx("grid size-11 shrink-0 place-items-center rounded-xl", u.icon)}>{s.unpaid.state === "CLEAR" ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}</span>
        </div>
        <div>
          <p className={clsx("text-3xl font-extrabold", u.text)}><CountUp value={amount} format={(n) => takaSpaced(locale, amount === 0 ? 0 : Math.round(n))} /></p>
          <p className={clsx("mt-0.5 text-xs font-medium", s.unpaid.state === "CLEAR" ? "text-green-700" : "text-slate-600")}>
            {s.unpaid.state === "CLEAR" ? t("cleared") : s.unpaid.state === "OVERDUE" ? t("late", { n: s.unpaid.lateMonths || s.unpaid.months }) : t("dueSoon", { day: s.unpaid.graceDay })}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
