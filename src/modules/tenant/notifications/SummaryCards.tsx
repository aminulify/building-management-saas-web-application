"use client";

import { Clock, TriangleAlert, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber } from "../../owner/dashboard/format";
import { dayLabel, daysUntil } from "./logic";
import type { Summary } from "./types";

const card = "flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.28)] motion-reduce:hover:translate-y-0";

/** Next payment date, active repair requests, and rule warnings + emergency alerts: all from the database. */
export function SummaryCards({ s }: { s: Summary | undefined }) {
  const t = useTranslations("tenant.notifications.summary");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const mp = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.45, delay: reduce ? 0 : i * 0.07 } });
  const skeleton = (w: string) => <span className={clsx("skeleton inline-block h-8 rounded", w)} aria-label={t("loading")} />;

  const np = s?.nextPayment;
  const days = np ? daysUntil(np.dueDate) : 0;
  const nextHint = !np ? "" : np.pending ? t("hintPending") : np.state === "UPCOMING" ? t("hintPaid") : days < 0 ? t("hintLate", { n: -days }) : days === 0 ? t("hintToday") : t("hintIn", { n: days });

  return (
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t("aria")}>
      <motion.div {...mp(0)} className={card}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("next")}</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">{!s ? skeleton("w-36") : np ? dayLabel(locale, np.dueDate) : t("noLease")}</p>
          {np && <p className={clsx("mt-0.5 text-xs font-medium", np.state === "OVERDUE" && !np.pending ? "text-red-600" : "text-slate-500")}>{nextHint}</p>}
        </div>
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#F0FDF4] text-green-600"><Clock className="size-6" /></span>
      </motion.div>

      <motion.div {...mp(1)} className={card}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("pending")}</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">{!s ? skeleton("w-40") : <CountUp value={s.pendingTasks} format={(v) => t("pendingValue", { n: n(v), count: s.pendingTasks })} />}</p>
        </div>
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FEFCE8] text-yellow-600"><Wrench className="size-6" /></span>
      </motion.div>

      <motion.div {...mp(2)} className={card}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("issues")}</p>
          <p className={clsx("mt-1 text-2xl font-extrabold", s && s.quickIssues.total > 0 ? "text-red-600" : "text-navy")}>{!s ? skeleton("w-12") : <CountUp value={s.quickIssues.total} format={n} />}</p>
          {s && <p className="mt-0.5 text-xs text-slate-500">{t("issuesHint", { rules: s.quickIssues.ruleWarnings, alerts: s.quickIssues.alerts })}</p>}
        </div>
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FEF2F2] text-red-500"><TriangleAlert className="size-6" /></span>
      </motion.div>
    </div>
  );
}
