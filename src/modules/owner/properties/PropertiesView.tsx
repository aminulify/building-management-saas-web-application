"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Plus, RefreshCw, Search, SearchX, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { formatNumber } from "../dashboard/format";
import { DeleteModal } from "./DeleteModal";
import { PropertyFormModal, type FormTarget } from "./PropertyFormModal";
import { PropertyTable } from "./PropertyTable";
import { matchesQuery } from "./schema";
import type { PropertyPage, PropertyRow } from "./types";

type State = "loading" | "ready" | "error";

/** Loads every page of the owner's properties (50 per request) so search and totals work on the full list. */
function useProperties() {
  const router = useRouter();
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [state, setState] = useState<State>("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const all: PropertyRow[] = [];
        let cursor: string | null = null;
        for (let i = 0; i < 20; i++) {
          const page: PropertyPage = await authApi<PropertyPage>(`/properties?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
          all.push(...page.items);
          cursor = page.nextCursor;
          if (!cursor) break;
        }
        if (!off) { setRows(all); setState("ready"); }
      } catch (e) {
        if (off) return;
        if (e instanceof ApiError && e.status === 401) { clearSession(); router.replace("/login?next=/owner/properties" as never); return; }
        setState("error");
      }
    })();
    return () => { off = true; };
  }, [tick, router]);

  return { rows, setRows, state, setState, reload: useCallback(() => setTick((n) => n + 1), []) };
}

export function PropertiesView() {
  const t = useTranslations("owner.properties");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const { rows, setRows, state, setState, reload } = useProperties();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormTarget>(null);
  const [toDelete, setToDelete] = useState<PropertyRow | null>(null);

  const visible = useMemo(() => rows.filter((p) => matchesQuery(p, query)), [rows, query]);
  const totals = useMemo(() => rows.reduce((s, p) => ({ units: s.units + p.totalUnits, occupied: s.occupied + p.occupiedUnits, vacant: s.vacant + p.vacantUnits }), { units: 0, occupied: 0, vacant: 0 }), [rows]);

  // "/" focuses the search box like on most dashboards
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) { e.preventDefault(); document.getElementById("property-search")?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const stat = [
    { key: "properties", value: rows.length, tone: "text-sky-600" },
    { key: "units", value: totals.units, tone: "text-blue-600" },
    { key: "occupied", value: totals.occupied, tone: "text-emerald-600" },
    { key: "vacant", value: totals.vacant, tone: "text-amber-600" },
  ] as const;

  return (
    <div className="space-y-5">
      <FadeIn as="header" className="flex flex-wrap items-center gap-3 sm:gap-4">
        <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
        <div className="glass-input order-3 flex h-11 w-full items-center gap-2 rounded-lg px-3 sm:order-none sm:w-auto sm:min-w-64 sm:flex-1 sm:max-w-sm">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input
            id="property-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 transition-colors hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>
        <button type="button" onClick={() => setForm("add")} className="btn btn-primary ml-auto h-11 px-5 sm:ml-0"><Plus className="size-4" aria-hidden />{t("add")}</button>
      </FadeIn>

      {state === "ready" && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat.map((s, i) => (
            <motion.div key={s.key} initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05 }}
              className="rounded-xl border border-white/70 bg-white/55 px-4 py-3 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-label">{t(`stats.${s.key}`)}</p>
              <p className={`mt-1 text-2xl font-bold ${s.tone}`}><CountUp value={s.value} format={n} /></p>
            </motion.div>
          ))}
        </div>
      )}

      <section aria-live="polite">
        {state === "loading" && (
          <div className="space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[72px] w-full rounded-xl" />)}</div>
        )}

        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={() => { setState("loading"); reload(); }} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}

        {state === "ready" && rows.length === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-14 text-center">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><Building2 className="size-8" /></span>
            <h2 className="text-lg font-bold text-navy">{t("emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("emptyText")}</p>
            <button type="button" onClick={() => setForm("add")} className="btn btn-primary mt-1 h-11 px-6"><Plus className="size-4" aria-hidden />{t("add")}</button>
          </FadeIn>
        )}

        {state === "ready" && rows.length > 0 && visible.length === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <SearchX className="size-10 text-slate-400" aria-hidden />
            <h2 className="text-lg font-bold text-navy">{t("noResultsTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("noResultsText", { query: query.trim() })}</p>
            <button type="button" onClick={() => { setQuery(""); document.getElementById("property-search")?.focus(); }} className="btn btn-white mt-1 h-10 px-5 text-sm">{t("clearSearchButton")}</button>
          </FadeIn>
        )}

        {state === "ready" && visible.length > 0 && <PropertyTable rows={visible} onEdit={setForm} onDelete={setToDelete} />}
      </section>

      <PropertyFormModal target={form} onClose={() => setForm(null)} onSaved={reload} />
      <DeleteModal property={toDelete} onClose={() => setToDelete(null)} onDeleted={(id) => setRows((r) => r.filter((p) => p.id !== id))} />
    </div>
  );
}
