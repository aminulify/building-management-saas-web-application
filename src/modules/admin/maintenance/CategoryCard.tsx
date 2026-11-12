"use client";

import { AlertTriangle, RefreshCw, Wrench, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatCount } from "../dashboard/format";
import type { MaintStats } from "./types";

/** Bar colours per category (blue, red, purple, green, gray from the design, then the rest of the palette). */
const COLOR: Record<string, string> = {
  PLUMBING: "from-[#0A84F0] to-[#48BDFA]", ELECTRICAL: "from-[#EF4444] to-[#FCA5A5]", GAS: "from-[#9333EA] to-[#C084FC]", SECURITY: "from-[#16A34A] to-[#86EFAC]",
  LIFT: "from-[#F59E0B] to-[#FCD34D]", PAINT: "from-[#EC4899] to-[#F9A8D4]", CLEANING: "from-[#0EA5E9] to-[#7DD3FC]", OTHER: "from-[#64748B] to-[#CBD5E1]",
};

interface Props { data: MaintStats | null; state: "loading" | "ready" | "error"; category: string | null; onCategory: (c: string | null) => void; onRetry: () => void }

/** Each category's share of the requests in the chosen dates; the shares add up to exactly 100%. Clicking a bar filters the table. */
export function CategoryCard({ data, state, category, onCategory, onRetry }: Props) {
  const t = useTranslations("admin.maintenance.category");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const count = formatCount(locale);
  const name = (c: string) => (t.has(`names.${c}` as never) ? t(`names.${c}` as never) : c.charAt(0) + c.slice(1).toLowerCase());
  const pct = (n: number) => `${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n)}%`;

  return (
    <section aria-labelledby="mc-title" className="glass-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="mc-title" className="text-xl font-bold text-navy">{t("title")}</h2><p className="mt-0.5 text-sm text-slate-600">{t("subtitle")}</p></div>
        {category && <button type="button" onClick={() => onCategory(null)} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-100"><X className="size-3.5" aria-hidden />{t("filtering", { name: name(category) })}</button>}
      </div>

      {state === "error" && !data ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      ) : !data ? (
        <div className="mt-5 space-y-4" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-full rounded-xl" />)}</div>
      ) : data.categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Wrench className="size-6" /></span><p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t("empty")}</p></div>
      ) : (
        <ul className="mt-5 space-y-3">
          {data.categories.map((c, i) => {
            const on = category === c.category;
            return (
              <li key={c.category}>
                <button type="button" aria-pressed={on} onClick={() => onCategory(on ? null : c.category)} className={clsx("block w-full rounded-xl p-2 text-left transition-colors duration-300 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-[#48BDFA]", on && "bg-white/80 ring-1 ring-[#48BDFA]")}>
                  <span className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-navy">{name(c.category)} <span className="font-medium text-slate-500">· {t("requests", { n: count(c.count) })}</span></span>
                    <span className="font-bold text-navy"><CountUp value={c.percent} format={pct} /></span>
                  </span>
                  <span role="meter" aria-label={name(c.category)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent} className="block h-3 overflow-hidden rounded-full bg-slate-200/70">
                    <motion.span initial={{ width: reduce ? `${c.percent}%` : 0 }} whileInView={{ width: `${c.percent}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.06, ease: "easeOut" }} className={`block h-full rounded-full bg-gradient-to-r ${COLOR[c.category] ?? COLOR.OTHER}`} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
