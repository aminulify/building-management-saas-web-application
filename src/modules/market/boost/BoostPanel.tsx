"use client";

import { AlertTriangle, ArrowLeft, RefreshCw, Rocket, Sparkles, Star, TrendingUp, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useAuthQuery } from "@/lib/use-auth-query";
import type { BoostSettings } from "./types";

interface Props { title: string; price: string; onBack: () => void; onConfirm: () => void }

const BENEFITS = [
  { key: "highlight", icon: Star, tone: "bg-amber-100 text-amber-600" },
  { key: "priority", icon: TrendingUp, tone: "bg-sky-100 text-sky-600" },
  { key: "faster", icon: Rocket, tone: "bg-fuchsia-100 text-fuchsia-600" },
] as const;

/** Step one of a boost, shown inside "My Listings": what the seller gets for the fee. "Confirm Boost" goes on to the payment page. */
export function BoostPanel({ title, price, onBack, onConfirm }: Props) {
  const t = useTranslations("owner.marketplace.boost");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const q = useAuthQuery<BoostSettings>("/boosts/settings");
  const s = q.data;
  const money = (v: string | number) => `৳${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 2 }).format(Number(v))}`;

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0A84F0]"><ArrowLeft className="size-4" aria-hidden />{t("back")}</button>
      <h2 id="mk-mine-title" className="pr-10 text-xl font-bold text-navy">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("forListing", { title })}</p>

      {q.state === "loading" && !s && <div aria-busy="true" className="mt-4 space-y-3"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div>}
      {q.state === "error" && !s && (
        <div role="alert" className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-red-50 px-4 py-8 text-center text-red-700"><AlertTriangle className="size-7" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      )}

      {s && (
        <>
          <ul className="mt-4 space-y-3">
            {BENEFITS.map(({ key, icon: Icon, tone }, i) => (
              <motion.li key={key} initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : i * 0.07 }}
                className="flex items-start gap-3 rounded-xl border border-white/70 bg-white/80 p-3.5 shadow-sm">
                <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
                <div><p className="font-bold text-navy">{t(`benefits.${key}.title`)}</p><p className="text-sm text-slate-600">{t(`benefits.${key}.text`)}</p></div>
              </motion.li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("fee")}</p><p className="text-2xl font-extrabold text-[#E2136E]">{money(s.fee)}</p></div>
            <p className="max-w-[16rem] text-sm text-slate-600"><Sparkles className="mr-1 inline size-4 text-fuchsia-500" aria-hidden />{t("feeNote", { days: s.durationDays, price: money(price) })}</p>
          </div>

          {!s.enabled && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{t("disabled")}</p>}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={onBack} className="btn btn-white h-11 px-6 text-sm">{t("cancel")}</button>
            <button type="button" onClick={onConfirm} disabled={!s.enabled} className="btn btn-primary h-11 px-6 text-sm"><Zap className="size-4" aria-hidden />{t("confirm")}</button>
          </div>
        </>
      )}
    </div>
  );
}
