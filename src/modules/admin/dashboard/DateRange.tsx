"use client";

import { ArrowRight, Calendar } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

interface Props { from: string; to: string; invalid: boolean; fetching: boolean; onChange: (next: { from: string; to: string }) => void }

/** Start → End: both are calendar days; changing either one recalculates the revenue card. */
export function DateRange({ from, to, invalid, fetching, onChange }: Props) {
  const t = useTranslations("admin.dashboard.range");
  const box = clsx("glass-input flex h-11 items-center gap-2 rounded-xl px-3 transition-shadow duration-300", fetching && "motion-safe:animate-pulse");
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t("label")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className={box} data-invalid={invalid ? true : undefined}>
          <Calendar className="size-4 shrink-0 text-[#48BDFA]" aria-hidden />
          <span className="sr-only">{t("from")}</span>
          <input type="date" value={from} max={to || undefined} required onChange={(e) => onChange({ from: e.target.value, to })} className="h-full w-[8.6rem] bg-transparent text-sm font-medium text-navy outline-none" />
        </label>
        <ArrowRight className="size-4 text-slate-400" aria-hidden />
        <label className={box} data-invalid={invalid ? true : undefined}>
          <Calendar className="size-4 shrink-0 text-[#48BDFA]" aria-hidden />
          <span className="sr-only">{t("to")}</span>
          <input type="date" value={to} min={from || undefined} required onChange={(e) => onChange({ from, to: e.target.value })} className="h-full w-[8.6rem] bg-transparent text-sm font-medium text-navy outline-none" />
        </label>
      </div>
      {invalid && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("invalid")}</p>}
    </fieldset>
  );
}
