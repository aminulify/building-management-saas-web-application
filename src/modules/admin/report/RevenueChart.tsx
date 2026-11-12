"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatTaka } from "../dashboard/format";
import type { ReportRevenue } from "./types";

interface Props { data: ReportRevenue | null; state: "loading" | "ready" | "error"; fetching: boolean; year: number | null; onYear: (y: number) => void; onRetry: () => void }

/** A "nice" top for the chart: 1, 2, 2.5, 5 or 10 times a power of ten above the biggest month. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= v) ?? 10 * pow);
}

/** Twelve months of one year. Each bar is plan money (blue) with boost money (amber) on top; hover or focus a month for the exact numbers. */
export function RevenueChart({ data, state, fetching, year, onYear, onRetry }: Props) {
  const t = useTranslations("admin.report.chart");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const taka = formatTaka(locale);
  const [active, setActive] = useState<number | null>(null);
  const tag = locale === "bn" ? "bn-BD" : "en-US";
  const monthName = (m: number, style: "short" | "long") => new Intl.DateTimeFormat(tag, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, m - 1, 1)));
  const compact = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);

  const { max, ticks } = useMemo(() => {
    const top = niceMax(Math.max(0, ...(data?.months ?? []).map((m) => m.subscription + m.boost)));
    return { max: top, ticks: [1, 0.75, 0.5, 0.25, 0].map((f) => top * f) };
  }, [data]);

  const total = (data?.totals.subscription ?? 0) + (data?.totals.boost ?? 0);
  const empty = state === "ready" && data !== null && total === 0;

  return (
    <section aria-labelledby="rc-title" className="glass-card p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="rc-title" className="text-xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="rc-year" className="sr-only">{t("year")}</label>
          <select id="rc-year" value={year ?? data?.year ?? ""} onChange={(e) => onYear(Number(e.target.value))} disabled={!data} className="glass-input h-10 rounded-xl px-3 text-sm font-semibold text-navy outline-none">
            {(data?.years ?? (year ? [year] : [])).map((y) => <option key={y} value={y}>{new Intl.NumberFormat(tag, { useGrouping: false }).format(y)}</option>)}
          </select>
          <ul className="flex items-center gap-3 text-xs font-semibold text-slate-600" aria-label={t("legend")}>
            <li className="flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-sm bg-gradient-to-t from-[#0A84F0] to-[#48BDFA]" />{t("subscriptions")}</li>
            <li className="flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-sm bg-gradient-to-t from-[#F59E0B] to-[#FCD34D]" />{t("boost")}</li>
          </ul>
        </div>
      </div>

      {state === "error" && !data ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      ) : !data ? (
        <div className="skeleton mt-5 h-64 w-full rounded-xl" aria-busy="true"><span className="sr-only">{t("loading")}</span></div>
      ) : (
        <div className={fetching ? "motion-safe:animate-pulse" : undefined}>
          <p className="mt-4 text-sm text-slate-600">{t("yearTotal", { year: new Intl.NumberFormat(tag, { useGrouping: false }).format(data.year) })} <strong className="ml-1 text-lg text-navy"><CountUp value={total} format={taka} /></strong></p>
          {empty ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><BarChart3 className="size-6" /></span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t("empty", { year: data.year })}</p>
            </div>
          ) : (
            <div className="mt-4 flex gap-2" role="group" aria-label={t("chartLabel", { year: data.year })}>
              <div aria-hidden className="relative flex h-60 w-10 shrink-0 flex-col justify-between text-right text-[0.68rem] font-medium text-slate-500 sm:w-12">
                {ticks.map((v, i) => <span key={i} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{compact(v)}</span>)}
              </div>
              <div className="relative min-w-0 flex-1">
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex h-60 flex-col justify-between">{ticks.map((_, i) => <i key={i} className="block border-t border-dashed border-slate-300/70" />)}</div>
                <div className="relative grid h-60 grid-cols-12 items-end gap-1 sm:gap-2" onMouseLeave={() => setActive(null)}>
                  {data.months.map((m, i) => {
                    const sub = (m.subscription / max) * 100, boost = (m.boost / max) * 100;
                    const on = active === m.month;
                    return (
                      <button key={m.month} type="button" onMouseEnter={() => setActive(m.month)} onFocus={() => setActive(m.month)} onBlur={() => setActive(null)}
                        aria-label={t("barLabel", { month: monthName(m.month, "long"), subscriptions: taka(m.subscription), boost: taka(m.boost) })}
                        className="group relative flex h-full flex-col justify-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-[#48BDFA]">
                        {on && (
                          <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-left text-xs shadow-lg backdrop-blur-md" style={{ marginLeft: i < 2 ? "3rem" : i > 9 ? "-3rem" : 0 }}>
                            <b className="block text-navy">{monthName(m.month, "long")}</b>
                            <span className="block text-[#0A84F0]">{t("subscriptions")}: {taka(m.subscription)}</span>
                            <span className="block text-amber-600">{t("boost")}: {taka(m.boost)}</span>
                          </span>
                        )}
                        {m.boost > 0 && <motion.span initial={{ height: reduce ? `${boost}%` : 0 }} whileInView={{ height: `${boost}%` }} viewport={{ once: true }} transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.03 }} className="block w-full rounded-t-md bg-gradient-to-t from-[#F59E0B] to-[#FCD34D]" />}
                        <motion.span initial={{ height: reduce ? `${sub}%` : 0 }} whileInView={{ height: `${sub}%` }} viewport={{ once: true }} transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.03 }} className={`block w-full bg-gradient-to-t from-[#0A84F0] to-[#48BDFA] transition-opacity duration-300 ${m.boost > 0 ? "" : "rounded-t-md"} ${active !== null && !on ? "opacity-50" : ""}`} style={{ minHeight: m.subscription > 0 ? 3 : 0 }} />
                      </button>
                    );
                  })}
                </div>
                <div aria-hidden className="mt-2 grid grid-cols-12 gap-1 sm:gap-2">{data.months.map((m) => <span key={m.month} className="truncate text-center text-[0.65rem] font-medium text-slate-500 sm:text-xs">{monthName(m.month, "short")}</span>)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
