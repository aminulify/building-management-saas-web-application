"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, SearchX, UserPlus, Users, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import type { OwnerProperty } from "../units/types";
import { AddTenantModal } from "./AddTenantModal";
import { EditTenantModal } from "./EditTenantModal";
import { MessageModal } from "./MessageModal";
import { RemoveTenantModal } from "./RemoveTenantModal";
import { TenantStats } from "./TenantStats";
import { TenantsTable } from "./TenantsTable";
import type { DirectoryPage, DirectoryRow, TenantTab } from "./types";
import { ViewTenantModal } from "./ViewTenantModal";

const PAGE_SIZE = 10;
const TABS: TenantTab[] = ["all", "leaveSoon", "overdue"];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function TenantsView() {
  const t = useTranslations("owner.tenants");
  const locale = useLocale();
  const n = formatNumber(locale);

  const [tab, setTab] = useState<TenantTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<DirectoryRow | null>(null);
  const [messaging, setMessaging] = useState<DirectoryRow | null>(null);
  const [editing, setEditing] = useState<DirectoryRow | null>(null);
  const [removing, setRemoving] = useState<DirectoryRow | null>(null);
  const q = useDebounced(search.trim(), 300);
  useEffect(() => { setPage(1); }, [q, tab]);

  const params = new URLSearchParams({ tab, page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  const dir = useAuthQuery<DirectoryPage>(`/tenancies/directory?${params.toString()}`);
  const props = useAuthQuery<{ items: OwnerProperty[] }>("/properties?limit=50");
  const properties = [...(props.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  // keep the last known numbers while another tab or page loads
  const stats = useRef<DirectoryPage["stats"] | null>(null);
  if (dir.data) stats.current = dir.data.stats;

  const data = dir.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  useEffect(() => { if (data && page > totalPages) setPage(totalPages); }, [data, page, totalPages]);
  const reload = () => { dir.reload(); props.reload(); };
  const noTenantsAtAll = !!data && data.stats.active === 0 && tab === "all" && !q;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) { e.preventDefault(); document.getElementById("tenant-search")?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const tabCount = (k: TenantTab) => (k === "leaveSoon" ? stats.current?.leaveSoon : k === "overdue" ? stats.current?.overdue : undefined);

  return (
    <div className="space-y-5">
      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="btn btn-primary h-11 px-5"><UserPlus className="size-4" aria-hidden />{t("addButton")}</button>
      </FadeIn>

      <TenantStats stats={stats.current} tab={tab} onTab={setTab} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label={t("tabsLabel")} className="inline-flex w-full rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 backdrop-blur-md sm:w-auto">
          {TABS.map((k) => {
            const c = tabCount(k);
            return (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx("relative flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300 sm:flex-none", tab === k ? "bg-white text-navy shadow-sm" : "text-slate-600 hover:text-navy")}>
                {t(`tabs.${k}`)}
                {c !== undefined && c > 0 && <span className={clsx("ml-1.5 inline-grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold text-white", k === "overdue" ? "bg-red-500" : "bg-amber-500")}>{n(c)}</span>}
              </button>
            );
          })}
        </div>
        <div className="glass-input flex h-11 w-full min-w-0 items-center gap-2 rounded-lg px-3 sm:max-w-xs">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input id="tenant-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 transition-colors hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>
      </div>

      <section aria-live="polite">
        {dir.state === "loading" && !data && (
          <div className="space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[68px] w-full rounded-xl" />)}</div>
        )}

        {dir.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}

        {dir.state === "ready" && noTenantsAtAll && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-14 text-center">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-violet-100 text-violet-600"><Users className="size-8" /></span>
            <h2 className="text-lg font-bold text-navy">{t("emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t("emptyText")}</p>
            <button type="button" onClick={() => setAdding(true)} className="btn btn-primary mt-1 h-11 px-6"><UserPlus className="size-4" aria-hidden />{t("addButton")}</button>
          </FadeIn>
        )}

        {dir.state === "ready" && data && !noTenantsAtAll && data.total === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <SearchX className="size-10 text-slate-400" aria-hidden />
            <h2 className="text-lg font-bold text-navy">{q ? t("noResultsTitle") : t(`emptyTab.${tab}`)}</h2>
            <p className="max-w-sm text-sm text-slate-600">{q ? t("noResultsText") : t("emptyTabText")}</p>
            <button type="button" onClick={() => { setSearch(""); setTab("all"); }} className="btn btn-white mt-1 h-10 px-5 text-sm">{t("showAll")}</button>
          </FadeIn>
        )}

        {data && data.items.length > 0 && (
          <>
            <TenantsTable rows={data.items} fetching={dir.fetching} onView={setViewing} onMessage={setMessaging} onEdit={setEditing} onRemove={setRemoving} />
            <div className="mt-3 flex flex-col items-center justify-between gap-3 px-1 text-sm text-slate-600 sm:flex-row">
              <p>{t("showing", { from: n(from), to: n(to), total: n(data.total) })}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || dir.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
                <span className="min-w-20 text-center text-xs font-semibold text-label">{t("pageOf", { page: n(page), pages: n(totalPages) })}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || dir.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
              </div>
            </div>
          </>
        )}
      </section>

      <AddTenantModal open={adding} properties={properties} propertiesState={props.state} onRetryProperties={props.reload} onClose={() => setAdding(false)} onSaved={() => { setTab("all"); setSearch(""); setPage(1); reload(); }} />
      <ViewTenantModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} onEdit={setEditing} />
      <MessageModal row={messaging} onClose={() => setMessaging(null)} />
      <EditTenantModal row={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <RemoveTenantModal row={removing} onClose={() => setRemoving(null)} onRemoved={reload} />
    </div>
  );
}
