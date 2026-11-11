"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FilterX, Search, Star, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import type { CategoryFilter, HomeFilters, SaleFilter, StatusFilter } from "../manage-home/types";

const STATUS: StatusFilter[] = ["all", "active", "pending", "reported", "rejected"];
const SALE: SaleFilter[] = ["all", "for_sale", "sold"];
const CATEGORY: CategoryFilter[] = ["all", "FLAT", "APARTMENT", "BUILDING", "LAND", "COMMERCIAL", "DUPLEX", "STUDIO"];

export const DEFAULT_FILTERS: HomeFilters = { mode: "sale", status: "all", occupancy: "all", sale: "all", q: "", category: "all", featured: "all" };
export const filtersActive = (f: HomeFilters) => !!f.q || f.status !== "all" || f.sale !== "all" || f.category !== "all" || f.featured === "yes";

function Select({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="glass-input relative flex h-11 items-center rounded-xl pl-3 pr-8">
      <span className="mr-2 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-label">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-2 text-sm font-semibold text-navy outline-none">{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
    </label>
  );
}

interface Props { filters: HomeFilters; onFilters: (f: HomeFilters) => void; total: number | null }

/** Search + Status + Sale + Category + Featured-only. The search waits for a pause in typing before it asks the server. */
export function MarketToolbar({ filters, onFilters, total }: Props) {
  const t = useTranslations("admin.manageMarket.filters");
  const tc = useTranslations("admin.manageMarket.categories");
  const tm = useTranslations("admin.manageHome");
  const locale = useLocale();
  const [text, setText] = useState(filters.q ?? "");

  useEffect(() => {
    if (text.trim() === (filters.q ?? "")) return;
    const h = setTimeout(() => onFilters({ ...filters, q: text.trim() }), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const clear = () => { setText(""); onFilters({ ...DEFAULT_FILTERS }); };
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

  return (
    <section aria-label={t("aria")} className="space-y-3 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5">
      <div className="glass-input flex h-12 items-center gap-2.5 rounded-xl px-3.5">
        <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
        <label htmlFor="mm-search" className="sr-only">{t("searchLabel")}</label>
        <input id="mm-search" type="search" value={text} maxLength={80} autoComplete="off" onChange={(e) => setText(e.target.value)} placeholder={t("searchPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
        {text && <button type="button" onClick={() => { setText(""); onFilters({ ...filters, q: "" }); }} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 hover:text-navy"><X className="size-4" aria-hidden /></button>}
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select id="mm-status" label={tm("filters.status")} value={filters.status} onChange={(v) => onFilters({ ...filters, status: v as StatusFilter })}>{STATUS.map((o) => <option key={o} value={o}>{tm(`filters.statusOptions.${o}`)}</option>)}</Select>
          <Select id="mm-sale" label={tm("filters.sale")} value={filters.sale} onChange={(v) => onFilters({ ...filters, sale: v as SaleFilter })}>{SALE.map((o) => <option key={o} value={o}>{tm(`filters.saleOptions.${o}`)}</option>)}</Select>
          <Select id="mm-category" label={t("category")} value={filters.category ?? "all"} onChange={(v) => onFilters({ ...filters, category: v as CategoryFilter })}>{CATEGORY.map((o) => <option key={o} value={o}>{o === "all" ? t("allCategories") : tc(o)}</option>)}</Select>
          <button type="button" aria-pressed={filters.featured === "yes"} onClick={() => onFilters({ ...filters, featured: filters.featured === "yes" ? "all" : "yes" })}
            className={clsx("inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-all duration-300", filters.featured === "yes" ? "border-amber-400 bg-amber-100 text-amber-700 shadow-[0_6px_14px_-8px_rgba(245,158,11,0.8)]" : "border-white/70 bg-white/70 text-slate-600 hover:border-amber-300 hover:text-amber-600")}>
            <Star className={clsx("size-4", filters.featured === "yes" && "fill-current")} aria-hidden />{t("featuredOnly")}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 xl:justify-end">
          {filtersActive(filters) && <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-white/70 hover:text-navy"><FilterX className="size-4" aria-hidden />{t("clear")}</button>}
          <p aria-live="polite" className="whitespace-nowrap text-sm font-semibold text-navy">{t("summary", { total: total === null ? "…" : num(total) })}</p>
        </div>
      </div>
    </section>
  );
}
