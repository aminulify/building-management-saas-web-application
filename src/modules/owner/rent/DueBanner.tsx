"use client";

import { CalendarDays, Loader2, Send } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber, formatTaka } from "../dashboard/format";
import { monthName } from "./period";
import type { LedgerStats } from "./types";

interface Props { stats: LedgerStats | null; month: string; sending: boolean; onSend: () => void }

/** Magenta → purple → blue banner: how much is still due and the one-click reminder to everyone past due. */
export function DueBanner({ stats, month, sending, onSend }: Props) {
  const t = useTranslations("owner.rent.banner");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const taka = formatTaka(locale), n = formatNumber(locale);
  const remind = stats?.remindable;
  const canSend = !!remind && remind.count > 0 && !sending;

  return (
    <motion.section
      aria-labelledby="due-title" initial={{ opacity: 0, y: reduce ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl bg-brand-gradient p-5 text-white shadow-[0_20px_40px_-20px_rgba(123,47,247,0.6)] sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl border border-white/30 bg-white/20 backdrop-blur-sm"><CalendarDays className="size-7" /></span>
          <div>
            <h2 id="due-title" className="text-xl font-bold sm:text-2xl">{t("title", { month: monthName(locale, month) })}</h2>
            <p className="text-sm text-white/85">
              {!stats ? t("subtitle") : remind!.count > 0 ? t("pastDue", { n: n(remind!.tenants) }) : stats.unpaidCount > 0 ? t("notDueYet") : t("allPaid")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-5 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-xs text-white/85">{t("amountDue")}</p>
            <p className="text-2xl font-bold leading-tight sm:text-3xl">{stats ? <CountUp value={Number(stats.dueAmount)} format={taka} /> : "—"}</p>
          </div>
          <button
            type="button" onClick={onSend} disabled={!canSend} aria-busy={sending || undefined} title={!canSend && !sending ? t("nothingToSend") : undefined}
            className="btn h-12 gap-2 bg-white px-5 text-[#0A84F0] shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0"
          >
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{sending ? t("sending") : t("send")}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
