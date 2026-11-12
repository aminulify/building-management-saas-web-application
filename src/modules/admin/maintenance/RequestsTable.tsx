"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Eye, Loader2, Pencil, Phone, RefreshCw, Search, Trash2, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { day } from "../manage-home/format";
import { ticket, type ReqFilters, type ReqPriority, type ReqRow, type ReqStatus } from "./types";
import { FIRST_PAGE, NEXT_PAGE, type useRequests } from "./use-requests";

export const STATUS_STYLE: Record<ReqStatus, string> = { PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-sky-100 text-sky-700", IN_PROGRESS: "bg-blue-100 text-blue-700", COMPLETED: "bg-emerald-100 text-emerald-700", REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-slate-200 text-slate-600" };
export const PRIORITY_STYLE: Record<ReqPriority, string> = { LOW: "bg-sky-100 text-sky-700", MEDIUM: "bg-amber-100 text-amber-700", HIGH: "bg-orange-100 text-orange-700", CRITICAL: "bg-red-100 text-red-700" };
const STATUSES: ReqFilters["status"][] = ["all", "PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"];
const PRIORITIES: ReqFilters["priority"][] = ["all", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

function Row({ r, index, onView, onEdit, onDelete }: { r: ReqRow; index: number; onView: (r: ReqRow) => void; onEdit: (r: ReqRow) => void; onDelete: (r: ReqRow) => void }) {
  const t = useTranslations("admin.maintenance.table");
  const tc = useTranslations("admin.maintenance.category");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const no = ticket(r.ticketNo);
  const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  const cat = tc.has(`names.${r.category}` as never) ? tc(`names.${r.category}` as never) : r.category;
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3"><p className="max-w-[16rem] truncate font-semibold text-navy" title={r.title}>{r.title}</p><p className="text-xs text-slate-500"><span className="font-mono font-semibold text-[#0A84F0]">{no}</span> • {day(locale, r.createdAt)}</p></td>
      <td className="px-4 py-3 text-sm"><p className="font-semibold text-navy">{r.unit.property.name}</p><p className="text-xs text-slate-500">({r.unit.unitNumber})</p></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{cat}</td>
      <td className="px-4 py-3 text-sm">
        <p className="font-semibold text-navy">{r.owner.fullName}</p>
        <p className="text-xs text-slate-500">{r.owner.ownerCode ? t("ownerId", { code: r.owner.ownerCode }) : ""}</p>
        {r.owner.phone && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(r.owner.phone)}</span></p>}
      </td>
      <td className="px-4 py-3"><span className={clsx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", PRIORITY_STYLE[r.priority])}>{t(`priority.${r.priority}`)}</span></td>
      <td className="px-4 py-3"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_STYLE[r.status])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`status.${r.status}`)}</span></td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { ticket: no })} title={t("view")} className={clsx(btn, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Eye className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onEdit(r)} aria-label={t("editAria", { ticket: no })} title={t("edit")} className={clsx(btn, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Pencil className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onDelete(r)} aria-label={t("deleteAria", { ticket: no })} title={t("delete")} className={clsx(btn, "hover:border-red-300 hover:text-red-600")}><Trash2 className="size-4" aria-hidden /></button>
        </div>
      </td>
    </motion.tr>
  );
}

interface Props { filters: ReqFilters; onFilters: (f: Partial<ReqFilters>) => void; text: string; onText: (v: string) => void; pages: ReturnType<typeof useRequests>; onView: (r: ReqRow) => void; onEdit: (r: ReqRow) => void; onDelete: (r: ReqRow) => void }

/** Recent Requests: search (REQ number, property, person), status and priority filters; 9 rows first, 10 more per click, scrolling inside the card. */
export function RequestsTable({ filters, onFilters, text, onText, pages, onView, onEdit, onDelete }: Props) {
  const t = useTranslations("admin.maintenance.table");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { items, total, state, more, hasMore, loadMore, reload } = pages;
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const filtered = filters.status !== "all" || filters.priority !== "all" || !!filters.category || !!filters.q;

  useEffect(() => { setExpanded(false); }, [filters.status, filters.priority, filters.category, filters.q]);
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);
  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };
  const sel = "glass-input h-10 rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <section aria-labelledby="rq-title" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-baseline gap-3"><h2 id="rq-title" className="text-xl font-bold text-navy">{t("title")}</h2><p aria-live="polite" className="text-sm font-semibold text-slate-600">{t("summary", { total: state === "ready" ? num(total) : "…" })}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="glass-input flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 sm:w-72 sm:flex-none">
              <Search className="size-4 shrink-0 text-slate-400" aria-hidden /><label htmlFor="rq-search" className="sr-only">{t("searchLabel")}</label>
              <input id="rq-search" type="search" value={text} maxLength={80} autoComplete="off" onChange={(e) => onText(e.target.value)} placeholder={t("searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="rq-status" className="sr-only">{t("statusLabel")}</label>
              <select id="rq-status" value={filters.status} onChange={(e) => onFilters({ status: e.target.value as ReqFilters["status"] })} className={sel}>{STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? `${t("statusLabel")}: ${t("status.all")}` : t(`status.${s}`)}</option>)}</select>
              <label htmlFor="rq-priority" className="sr-only">{t("priorityLabel")}</label>
              <select id="rq-priority" value={filters.priority} onChange={(e) => onFilters({ priority: e.target.value as ReqFilters["priority"] })} className={sel}>{PRIORITIES.map((p) => <option key={p} value={p}>{p === "all" ? `${t("priorityLabel")}: ${t("priority.all")}` : t(`priority.${p}`)}</option>)}</select>
            </div>
          </div>
        </div>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(34rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className="w-full min-w-[960px] text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{(["issue", "property", "category", "owner", "priority", "status", "actions"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={7} className="px-4 py-3"><div className="skeleton h-12 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Wrench className="size-6" /></span>
            <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(filtered ? "empty.filtered" : "empty.none")}</p></div>
        )}
      </div>

      {state === "ready" && items.length > 0 && (hasMore || more === "error") && (
        <div className="flex flex-col items-center gap-2 border-t border-slate-200/70 px-4 py-3">
          {more === "error" && <p role="alert" className="text-xs font-medium text-red-600">{t("moreError")}</p>}
          <button type="button" onClick={onMore} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-100/70 disabled:opacity-60">
            {more === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{more === "loading" ? t("loadingMore") : t("viewMore")}
          </button>
        </div>
      )}
    </section>
  );
}
