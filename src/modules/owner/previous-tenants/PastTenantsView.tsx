"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, History, RefreshCw, Search, SearchX, Star, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { GlassSelect } from "@/components/glass/GlassField";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import type { OwnerProperty } from "../units/types";
import { EditRecordModal } from "./EditRecordModal";
import { HistoryModal } from "./HistoryModal";
import { PastTable } from "./PastTable";
import { ReassignModal } from "./ReassignModal";
import { RemoveRecordModal } from "./RemoveRecordModal";
import { BEHAVIORS, PAGE_SIZE } from "./logic";
import type { BehaviorFilter, PastDetail, PastPage, PastRow } from "./types";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function PastTenantsView() {
  const t = useTranslations("owner.previousTenants");
  const locale = useLocale();
  const n = formatNumber(locale);

  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [behavior, setBehavior] = useState<BehaviorFilter>("ALL");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<PastRow | null>(null);
  const [editing, setEditing] = useState<PastRow | null>(null);
  const [removing, setRemoving] = useState<PastRow | null>(null);
  const [reassigning, setReassigning] = useState<PastDetail | null>(null);
  const q = useDebounced(search.trim(), 300);
  useEffect(() => { setPage(1); }, [q, propertyId, behavior]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (propertyId) params.set("propertyId", propertyId);
  if (behavior !== "ALL") params.set("behavior", behavior);
  const list = useAuthQuery<PastPage>(`/tenancies/past?${params.toString()}`);
  const props = useAuthQuery<{ items: OwnerProperty[] }>("/properties?limit=50");
  const properties = useMemo(() => [...(props.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [props.data]);

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  useEffect(() => { if (data && page > totalPages) setPage(totalPages); }, [data, page, totalPages]);
  const filtered = !!q || !!propertyId || behavior !== "ALL";
  const none = !!data && data.all === 0;
  const reload = () => { list.reload(); props.reload(); };

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-80 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        {data && data.all > 0 && (
          <div className="rounded-xl border border-white/70 bg-white/60 px-4 py-2 text-center backdrop-blur-md">
            <p className="text-2xl font-extrabold leading-none text-navy"><CountUp value={data.all} format={n} /></p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-label">{t("totalRecords")}</p>
          </div>
        )}
      </FadeIn>

      <div className="grid gap-3 rounded-xl border border-white/70 bg-white/50 p-3 backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <div className="glass-input flex h-12 min-w-0 items-center gap-2 rounded-lg px-3 sm:col-span-2 lg:col-span-1">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input id="past-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 transition-colors hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>
        <GlassSelect id="past-property" icon={Building2} aria-label={t("propertyLabel")} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} loading={props.state === "loading"}>
          <option value="">{t("allProperties")}</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </GlassSelect>
        <GlassSelect id="past-status" icon={Star} aria-label={t("statusLabel")} value={behavior} onChange={(e) => setBehavior(e.target.value as BehaviorFilter)}>
          <option value="ALL">{t("allStatus")}</option>
          {BEHAVIORS.map((k) => <option key={k} value={k}>{t(`behavior.${k}`)}</option>)}
          <option value="UNRATED">{t("behavior.UNRATED")}</option>
        </GlassSelect>
      </div>

      <section aria-live="polite">
        {list.state === "loading" && !data && <div className="space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[68px] w-full rounded-xl" />)}</div>}

        {list.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}

        {list.state === "ready" && none && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-14 text-center backdrop-blur-md">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-violet-100 text-violet-600"><History className="size-8" /></span>
            <h2 className="text-lg font-bold text-navy">{t("emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("emptyText")}</p>
            <Link href={"/home-owner/tenants" as never} className="btn btn-primary mt-1 h-11 px-6">{t("goTenants")}</Link>
          </FadeIn>
        )}

        {list.state === "ready" && data && !none && data.total === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <SearchX className="size-10 text-slate-400" aria-hidden />
            <h2 className="text-lg font-bold text-navy">{t("noResultsTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("noResultsText")}</p>
            {filtered && <button type="button" onClick={() => { setSearch(""); setPropertyId(""); setBehavior("ALL"); }} className="btn btn-white mt-1 h-10 px-5 text-sm">{t("clearFilters")}</button>}
          </FadeIn>
        )}

        {data && data.items.length > 0 && (
          <>
            <PastTable rows={data.items} fetching={list.fetching} onOpen={setOpened} onEdit={setEditing} onRemove={setRemoving} />
            <div className="mt-3 flex flex-col items-center justify-between gap-3 px-1 text-sm text-slate-600 sm:flex-row">
              <p>{t("showing", { from: n(from), to: n(to), total: n(data.total) })}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || list.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
                <span className="min-w-20 text-center text-xs font-semibold text-label">{t("pageOf", { page: n(page), pages: n(totalPages) })}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || list.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
              </div>
            </div>
          </>
        )}
      </section>

      <HistoryModal row={opened} onClose={() => setOpened(null)} onReassign={(d) => { setOpened(null); setReassigning(d); }} />
      <EditRecordModal row={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <RemoveRecordModal row={removing} onClose={() => setRemoving(null)} onRemoved={reload} />
      <ReassignModal detail={reassigning} onClose={() => setReassigning(null)} onDone={reload} />
    </div>
  );
}
