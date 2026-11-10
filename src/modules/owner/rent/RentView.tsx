"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, ReceiptText, RefreshCw, Search, SearchX, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import type { OwnerProperty } from "../units/types";
import { DueBanner } from "./DueBanner";
import { LedgerTable } from "./LedgerTable";
import { currentMonth, monthLabel, monthOptions } from "./period";
import { downloadReceiptPdf, downloadReportPdf } from "./pdf";
import { RentStats } from "./RentStats";
import type { LedgerItem, LedgerPage, LedgerStats, RemindResult, RentReceipt, RentReport, StatusFilter } from "./types";

const PAGE_SIZE = 10;
const FILTERS: StatusFilter[] = ["all", "paid", "unpaid"];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

const errorKey = (e: unknown) => (e instanceof ApiError ? (e.code === "RATE_LIMITED" ? "rateLimited" : e.code === "NETWORK" ? "network" : e.code === "FORBIDDEN" ? "forbidden" : "generic") : "generic");

export function RentView() {
  const t = useTranslations("owner.rent");
  const locale = useLocale();
  const toast = useToast();
  const n = formatNumber(locale);

  const [month, setMonth] = useState(currentMonth());
  const [propertyId, setPropertyId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const q = useDebounced(search.trim(), 300);
  useEffect(() => { setPage(1); }, [month, propertyId, status, q]);

  const params = new URLSearchParams({ month, status, page: String(page), pageSize: String(PAGE_SIZE) });
  if (propertyId) params.set("propertyId", propertyId);
  if (q) params.set("q", q);
  const ledger = useAuthQuery<LedgerPage>(`/rent/ledger?${params.toString()}`);
  const props = useAuthQuery<{ items: OwnerProperty[] }>("/properties?limit=50");
  const properties = useMemo(() => [...(props.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [props.data]);
  const months = useMemo(() => monthOptions(), []);

  const data = ledger.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  useEffect(() => { if (data && page > totalPages) setPage(totalPages); }, [data, page, totalPages]);
  const filtered = !!(q || propertyId || status !== "all");
  const stats: LedgerStats | null = data?.stats ?? null;
  const baseBody = { month, ...(propertyId ? { propertyId } : {}) };

  async function sendReminders() {
    setSending(true);
    try {
      const r = await authApi<RemindResult>("/rent/remind", { method: "POST", body: baseBody });
      if (r.sent > 0) toast("success", `${t("toast.reminded")} ${t("toast.remindedDetail", { n: n(r.sent) })}`);
      else if (r.skippedRecent > 0) toast("success", t("toast.alreadyReminded", { n: n(r.skippedRecent) }));
      else toast("success", t("toast.nobody"));
      ledger.reload();
    } catch (e) {
      toast("error", t(`toast.errors.${errorKey(e)}` as never));
    } finally {
      setSending(false);
    }
  }

  async function exportReport() {
    setExporting(true);
    try {
      const rp = new URLSearchParams({ month, status });
      if (propertyId) rp.set("propertyId", propertyId);
      if (q) rp.set("q", q);
      const report = await authApi<RentReport>(`/rent/report?${rp.toString()}`);
      const file = await downloadReportPdf(report);
      toast("success", t("toast.exported", { file }));
    } catch (e) {
      toast("error", t(`toast.errors.${errorKey(e)}` as never));
    } finally {
      setExporting(false);
    }
  }

  async function openReceipt(r: LedgerItem) {
    if (!r.receiptPaymentId) return;
    setReceiptBusy(r.recordId);
    try {
      const receipt = await authApi<RentReceipt>(`/rent/payments/${r.receiptPaymentId}/receipt`);
      const file = await downloadReceiptPdf(receipt);
      toast("success", t("toast.receipt", { file }));
    } catch (e) {
      toast("error", t(`toast.errors.${errorKey(e)}` as never));
    } finally {
      setReceiptBusy(null);
    }
  }

  const select = "glass-input relative flex h-11 items-center rounded-lg pl-3 pr-9";
  const clear = () => { setSearch(""); setPropertyId(""); setStatus("all"); };

  return (
    <div className="space-y-5">
      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <button type="button" onClick={exportReport} disabled={exporting || ledger.state === "error"} aria-busy={exporting || undefined} className="btn btn-primary h-11 gap-2 px-5">
          {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}{exporting ? t("exporting") : t("export")}
        </button>
      </FadeIn>

      <RentStats stats={stats} month={month} />
      <DueBanner stats={stats} month={month} sending={sending} onSend={sendReminders} />

      <section aria-labelledby="history-title" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white/60 p-3 backdrop-blur-md sm:p-4 lg:flex-row lg:items-center">
          <h2 id="history-title" className="text-lg font-bold text-navy lg:mr-auto">{t("history")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <div className={clsx(select, "col-span-1")}>
              <label htmlFor="rent-month" className="sr-only">{t("monthFilter")}</label>
              <select id="rent-month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-navy outline-none sm:w-40">
                {months.map((g) => (
                  <optgroup key={g.year} label={new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { useGrouping: false }).format(g.year)}>
                    {g.months.map((m) => <option key={m} value={m}>{monthLabel(locale, m)}</option>)}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
            </div>
            <div className={clsx(select, "col-span-1")}>
              <label htmlFor="rent-property" className="sr-only">{t("propertyFilter")}</label>
              <select id="rent-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-navy outline-none sm:w-40">
                <option value="">{t("allProperty")}</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
            </div>
            <div role="tablist" aria-label={t("statusFilter")} className="col-span-2 inline-flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 sm:col-span-1">
              {FILTERS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)}
                  className={clsx("flex-1 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-300 sm:flex-none", status === k ? "bg-white text-navy shadow-sm" : "text-slate-600 hover:text-navy")}>
                  {t(`filters.${k}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-input flex h-11 w-full items-center gap-2 rounded-lg px-3 sm:max-w-xs">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 transition-colors hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>

        <div aria-live="polite">
          {ledger.state === "loading" && !data && (
            <div className="space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[64px] w-full rounded-xl" />)}</div>
          )}

          {ledger.state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
              <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
              <button type="button" onClick={ledger.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
            </div>
          )}

          {ledger.state === "ready" && data && data.total === 0 && (
            <FadeIn className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-14 text-center">
              {filtered ? <SearchX className="size-10 text-slate-400" aria-hidden /> : <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><ReceiptText className="size-8" /></span>}
              <h3 className="text-lg font-bold text-navy">{filtered ? t("noResultsTitle") : t("emptyTitle", { month: monthLabel(locale, month) })}</h3>
              <p className="max-w-sm text-sm text-slate-600">{filtered ? t("noResultsText") : t("emptyText")}</p>
              {filtered && <button type="button" onClick={clear} className="btn btn-white mt-1 h-10 px-5 text-sm">{t("clearFilters")}</button>}
            </FadeIn>
          )}

          {data && data.items.length > 0 && (
            <>
              <LedgerTable rows={data.items} fetching={ledger.fetching} receiptBusy={receiptBusy} onReceipt={openReceipt} />
              <div className="mt-3 flex flex-col items-center justify-between gap-3 px-1 text-sm text-slate-600 sm:flex-row">
                <p>{t("showing", { from: n(from), to: n(to), total: n(data.total) })}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || ledger.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
                  <span className="min-w-20 text-center text-xs font-semibold text-label">{t("pageOf", { page: n(page), pages: n(totalPages) })}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || ledger.fetching} className="btn btn-white h-9 gap-1 px-3 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
