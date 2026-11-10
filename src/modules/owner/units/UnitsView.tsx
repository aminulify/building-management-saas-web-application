"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ChevronDown, ChevronLeft, ChevronRight, FilterX, Plus, RefreshCw, Search, SearchX, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import { DeleteUnitModal } from "./DeleteUnitModal";
import { UnitFormModal, type UnitFormTarget } from "./UnitFormModal";
import { UnitsTable } from "./UnitsTable";
import type { OwnerProperty, UnitRow, UnitStatus, UnitsPage } from "./types";

const PAGE_SIZE = 10;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function UnitsView() {
  const t = useTranslations("owner.units");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);

  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [status, setStatus] = useState<UnitStatus | "">("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<UnitFormTarget>(null);
  const [toDelete, setToDelete] = useState<UnitRow | null>(null);
  const q = useDebounced(search.trim(), 300);

  // any change of the filters starts again from page 1
  useEffect(() => { setPage(1); }, [q, propertyId, status]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (propertyId) params.set("propertyId", propertyId);
  if (status) params.set("status", status);

  const units = useAuthQuery<UnitsPage>(`/units?${params.toString()}`);
  const props = useAuthQuery<{ items: OwnerProperty[] }>("/properties?limit=50");
  const properties = useMemo(() => [...(props.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [props.data]);

  const data = units.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const filtered = !!(q || propertyId || status);
  const clearFilters = () => { setSearch(""); setPropertyId(""); setStatus(""); };

  // a page can disappear (last row deleted, filter changed): fall back to the last existing page
  useEffect(() => { if (data && page > totalPages) setPage(totalPages); }, [data, page, totalPages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) { e.preventDefault(); document.getElementById("unit-search")?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const chips: { key: "all" | "occupied" | "vacant" | "maintenance"; value: UnitStatus | ""; tone: string; ring: string }[] = [
    { key: "all", value: "", tone: "text-sky-600", ring: "ring-sky-300" },
    { key: "occupied", value: "OCCUPIED", tone: "text-emerald-600", ring: "ring-emerald-300" },
    { key: "vacant", value: "VACANT", tone: "text-pink-600", ring: "ring-pink-300" },
    { key: "maintenance", value: "MAINTENANCE", tone: "text-amber-600", ring: "ring-amber-300" },
  ];
  const select = "glass-input relative flex h-11 items-center rounded-lg pl-3 pr-9";
  const reload = () => { units.reload(); props.reload(); };

  return (
    <div className="space-y-5">
      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-md text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <button type="button" onClick={() => setForm("add")} className="btn btn-primary h-11 px-5"><Plus className="size-4" aria-hidden />{t("add")}</button>
      </FadeIn>

      {data && data.counts.all > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={t("chipsLabel")}>
          {chips.map((c, i) => (
            <motion.button
              key={c.key} type="button" aria-pressed={status === c.value} onClick={() => setStatus(c.value)}
              initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05 }}
              className={clsx("rounded-xl border bg-white/55 px-4 py-3 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0", status === c.value ? `border-transparent ring-2 ${c.ring}` : "border-white/70")}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-label">{t(`chips.${c.key}`)}</p>
              <p className={`mt-1 text-2xl font-bold ${c.tone}`}><CountUp value={data.counts[c.key]} format={n} /></p>
            </motion.button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 backdrop-blur-md sm:flex-row sm:items-center">
        <div className="glass-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input id="unit-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 transition-colors hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className={select}>
            <label htmlFor="unit-property" className="sr-only">{t("propertyFilter")}</label>
            <select id="unit-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-navy outline-none sm:w-44">
              <option value="">{t("allProperties")}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
          </div>
          <div className={select}>
            <label htmlFor="unit-status" className="sr-only">{t("statusFilter")}</label>
            <select id="unit-status" value={status} onChange={(e) => setStatus(e.target.value as UnitStatus | "")} className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-navy outline-none sm:w-36">
              <option value="">{t("allStatuses")}</option>
              <option value="OCCUPIED">{t("status.OCCUPIED")}</option>
              <option value="VACANT">{t("status.VACANT")}</option>
              <option value="MAINTENANCE">{t("status.MAINTENANCE")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
          </div>
        </div>
        {filtered && <button type="button" onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#0A84F0] transition-colors hover:bg-white/70"><FilterX className="size-4" aria-hidden />{t("clearFilters")}</button>}
      </div>

      <section aria-live="polite">
        {units.state === "loading" && !data && (
          <div className="space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[64px] w-full rounded-xl" />)}</div>
        )}

        {units.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}

        {units.state === "ready" && data && data.counts.all === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-14 text-center">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><Boxes className="size-8" /></span>
            <h2 className="text-lg font-bold text-navy">{t("emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{properties.length === 0 ? t("emptyNoProperty") : t("emptyText")}</p>
            {properties.length === 0
              ? <Link href={"/owner/properties" as never} className="btn btn-primary mt-1 h-11 px-6"><Plus className="size-4" aria-hidden />{t("goProperties")}</Link>
              : <button type="button" onClick={() => setForm("add")} className="btn btn-primary mt-1 h-11 px-6"><Plus className="size-4" aria-hidden />{t("add")}</button>}
          </FadeIn>
        )}

        {units.state === "ready" && data && data.counts.all > 0 && data.total === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <SearchX className="size-10 text-slate-400" aria-hidden />
            <h2 className="text-lg font-bold text-navy">{t("noResultsTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("noResultsText")}</p>
            <button type="button" onClick={clearFilters} className="btn btn-white mt-1 h-10 px-5 text-sm">{t("clearFilters")}</button>
          </FadeIn>
        )}

        {data && data.items.length > 0 && (
          <>
            <UnitsTable rows={data.items} fetching={units.fetching} onEdit={setForm} onDelete={setToDelete} />
            <div className="mt-3 flex flex-col items-center justify-between gap-3 px-1 text-sm text-slate-600 sm:flex-row">
              <p>{t("showing", { from: n(from), to: n(to), total: n(data.total) })}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || units.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
                <span className="min-w-20 text-center text-xs font-semibold text-label">{t("pageOf", { page: n(page), pages: n(totalPages) })}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || units.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
              </div>
            </div>
          </>
        )}
      </section>

      <UnitFormModal target={form} properties={properties} defaultPropertyId={propertyId || undefined} onClose={() => setForm(null)} onSaved={reload} />
      <DeleteUnitModal unit={toDelete} onClose={() => setToDelete(null)} onDeleted={reload} />
    </div>
  );
}
