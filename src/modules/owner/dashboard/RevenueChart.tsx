"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, formatTaka, shortMonth } from "./format";
import { SectionError } from "./SectionState";
import type { OwnerRevenue } from "./types";

interface Props {
  data: OwnerRevenue | null; state: "loading" | "ready" | "error"; fetching: boolean;
  year: number; onYear: (y: number) => void; onRetry: () => void;
}

/** Grey bar = rent expected that month, blue bar = rent actually collected. Hover/focus a month for the exact figures. */
export function RevenueChart({ data, state, fetching, year, onYear, onRetry }: Props) {
  const t = useTranslations("owner.chart");
  const locale = useLocale();
  const taka = formatTaka(locale), num = formatNumber(locale);
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  const years = data?.years ?? [year];
  const max = Math.max(1, ...(data?.months ?? []).map((m) => Math.max(Number(m.expected), Number(m.collected))));
  const empty = !!data && Number(data.totals.expected) === 0 && Number(data.totals.collected) === 0;

  return (
    <section className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md sm:p-6" aria-labelledby="rev-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="rev-title" className="text-lg font-bold text-navy">{t("title")}</h2>
          {data && !empty && <p className="mt-0.5 text-xs text-slate-600">{t("summary", { collected: taka(Number(data.totals.collected)), expected: taka(Number(data.totals.expected)) })}</p>}
        </div>
        <div className="glass-input relative flex h-10 items-center rounded-lg pl-3 pr-8">
          <label htmlFor="rev-year" className="sr-only">{t("year")}</label>
          <select id="rev-year" value={year} onChange={(e) => onYear(Number(e.target.value))} className="cursor-pointer appearance-none bg-transparent pr-2 text-sm font-medium text-navy outline-none">
            {years.map((y) => <option key={y} value={y}>{new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { useGrouping: false }).format(y)}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
        </div>
      </div>

      <div className="mt-5">
        {state === "error" ? <SectionError onRetry={onRetry} /> : state === "loading" || !data ? (
          <div className="skeleton h-64 w-full rounded-xl" aria-busy="true" />
        ) : empty ? (
          <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-300 bg-white/40 text-center text-sm text-slate-600">
            <p className="max-w-xs px-4">{t("empty", { year: new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { useGrouping: false }).format(year) })}</p>
          </div>
        ) : (
          <div className={clsx("transition-opacity duration-300", fetching && "opacity-60")}>
            <div className="mb-3 flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#0A84F0]" aria-hidden />{t("collected")}</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-slate-300" aria-hidden />{t("expected")}</span>
            </div>
            <div role="list" className="grid h-56 grid-cols-12 items-end gap-1.5 sm:gap-2.5">
              {data.months.map((m, i) => {
                const exp = Number(m.expected), col = Number(m.collected);
                const rate = exp > 0 ? Math.round((col * 100) / exp) : 0;
                const label = shortMonth(locale, m.month);
                return (
                  <div key={m.month} role="listitem" className="relative flex h-full flex-col justify-end">
                    <button
                      type="button" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      aria-label={t("monthLabel", { month: label, collected: taka(col), expected: taka(exp) })}
                      className="relative flex h-full w-full items-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <motion.span
                        className="absolute bottom-0 w-full origin-bottom rounded-md bg-slate-200/90"
                        style={{ height: `${(Math.max(exp, col) / max) * 100}%` }}
                        initial={{ scaleY: reduce ? 1 : 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.03 }}
                      />
                      <motion.span
                        className={clsx("absolute bottom-0 w-full origin-bottom rounded-md transition-colors duration-300", active === i ? "bg-[#0066CC]" : "bg-[#0A84F0]")}
                        style={{ height: `${(col / max) * 100}%` }}
                        initial={{ scaleY: reduce ? 1 : 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: reduce ? 0 : 0.1 + i * 0.03 }}
                      />
                    </button>
                    {active === i && (
                      <div role="tooltip" className={clsx("pointer-events-none absolute bottom-full z-10 mb-2 w-36 rounded-lg border border-white/80 bg-white/95 px-2.5 py-2 text-xs shadow-lg", i > 8 ? "right-0" : i < 3 ? "left-0" : "left-1/2 -translate-x-1/2")}>
                        <p className="font-bold text-navy">{label}</p>
                        <p className="text-[#0A84F0]">{t("collected")}: {taka(col)}</p>
                        <p className="text-slate-600">{t("expected")}: {taka(exp)}</p>
                        <p className="font-medium text-navy">{t("rate", { rate: num(rate) })}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-12 gap-1.5 text-center text-[10px] text-slate-600 sm:gap-2.5 sm:text-xs" aria-hidden>
              {data.months.map((m) => <span key={m.month} className="truncate">{shortMonth(locale, m.month)}</span>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
