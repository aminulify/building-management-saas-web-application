"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Mail, Pencil, Phone, RefreshCw, Search, Trash2, UserMinus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { REASONS, STATES, type ArchiveRow, type ExitState, type ReasonFilter, type StatusFilter } from "./types";
import type { usePreviousOwners } from "./use-previous-owners";

export const STATE_STYLE: Record<ExitState, string> = {
  ARCHIVED: "bg-amber-100 text-amber-700", BANNED: "bg-red-100 text-red-700", INACTIVE: "bg-emerald-100 text-emerald-700", DELETED: "bg-slate-200 text-slate-600",
};

export function StateBadge({ state }: { state: ExitState }) {
  const t = useTranslations("admin.previousOwners.status");
  return <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(state)}</span>;
}

interface RowProps { r: ArchiveRow; index: number; onView: (r: ArchiveRow) => void; onEdit: (r: ArchiveRow) => void; onDelete: (r: ArchiveRow) => void }

function Row({ r, index, onView, onEdit, onDelete }: RowProps) {
  const t = useTranslations("admin.previousOwners.table");
  const tr = useTranslations("admin.previousOwners.reason");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3">
        <button type="button" onClick={() => onView(r)} aria-label={t("openAria", { name: r.fullName })} className="group flex items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
          <Avatar name={r.fullName} url={r.avatarUrl} />
          <span className="min-w-0"><span className="block truncate font-semibold text-navy transition-colors duration-300 group-hover:text-[#0A84F0]">{r.fullName}</span><span className="block text-xs text-slate-500">{r.ownerCode ? t("ownerId", { code: r.ownerCode }) : `@${r.username}`}</span></span>
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        <p className="flex max-w-[15rem] items-center gap-1.5 break-all"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{t("email")}: </span>{r.email ?? "—"}</p>
        <p className="flex items-center gap-1.5"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{t("phone")}: </span><span dir="ltr">{formatPhone(r.phone)}</span></p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-navy">{t("history", { count: r.properties })}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{day(locale, r.leftAt)}</td>
      <td className="px-4 py-3 text-sm font-semibold text-navy">{tr(r.reasonCode)}</td>
      <td className="px-4 py-3"><StateBadge state={r.state} /></td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { name: r.fullName })} title={t("view")} className={clsx(btn, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Eye className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onEdit(r)} aria-label={t("editAria", { name: r.fullName })} title={t("edit")} className={clsx(btn, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Pencil className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onDelete(r)} aria-label={t("deleteAria", { name: r.fullName })} title={t("delete")} className={clsx(btn, "hover:border-red-300 hover:text-red-600")}><Trash2 className="size-4" aria-hidden /></button>
        </div>
      </td>
    </motion.tr>
  );
}

interface Props {
  status: StatusFilter; onStatus: (s: StatusFilter) => void; reason: ReasonFilter; onReason: (r: ReasonFilter) => void; text: string; onText: (v: string) => void;
  pages: ReturnType<typeof usePreviousOwners>; onView: (r: ArchiveRow) => void; onEdit: (r: ArchiveRow) => void; onDelete: (r: ArchiveRow) => void;
}

/** Reason and Status filters, the name / ID search, the table and "Showing 1 to 10 of N entries" with Previous / Next. */
export function OwnersTable({ status, onStatus, reason, onReason, text, onText, pages, onView, onEdit, onDelete }: Props) {
  const t = useTranslations("admin.previousOwners.table");
  const ts = useTranslations("admin.previousOwners.status");
  const tr = useTranslations("admin.previousOwners.reason");
  const locale = useLocale();
  const { data, state, page, setPage, reload } = pages;
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const total = data?.total ?? 0, size = data?.pageSize ?? 10;
  const from = total === 0 ? 0 : (page - 1) * size + 1, to = Math.min(page * size, total);
  const cols = ["owner", "contact", "history", "leftDate", "reason", "status", "actions"] as const;
  const select = "glass-input h-11 min-w-44 rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <section aria-labelledby="po-table" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="po-table" className="sr-only">{t("title")}</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="po-reason" className="sr-only">{t("reasonLabel")}</label>
          <select id="po-reason" value={reason} onChange={(e) => onReason(e.target.value as ReasonFilter)} className={select}>
            <option value="all">{t("allReasons")}</option>
            {REASONS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
          </select>
          <label htmlFor="po-status" className="sr-only">{t("statusLabel")}</label>
          <select id="po-status" value={status} onChange={(e) => onStatus(e.target.value as StatusFilter)} className={select}>
            <option value="all">{t("allStatuses")}</option>
            {STATES.map((x) => <option key={x} value={x}>{ts(x)}</option>)}
          </select>
        </div>
        <div className="glass-input flex h-11 min-w-0 items-center gap-2 rounded-xl px-3 lg:w-80">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden /><label htmlFor="po-search" className="sr-only">{t("searchLabel")}</label>
          <input id="po-search" type="search" value={text} maxLength={80} autoComplete="off" onChange={(e) => onText(e.target.value)} placeholder={t("searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="bg-white/85"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{cols.map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={cols.length} className="px-4 py-3"><div className="skeleton h-12 w-full" /></td></tr>)}
            {state !== "loading" && data?.items.map((r, i) => <Row key={r.id} r={r} index={i} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><UserMinus className="size-6" /></span>
            <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(status !== "all" || reason !== "all" || text ? "empty.filtered" : "empty.none")}</p></div>
        )}
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 sm:flex-row sm:px-6">
        <p aria-live="polite" className="text-sm text-slate-600">{state === "ready" ? t("showing", { from: num(from), to: num(to), total: num(total) }) : "…"}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1 || state === "loading"} className="btn btn-white h-10 px-4 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
          <button type="button" onClick={() => setPage(page + 1)} disabled={to >= total || state === "loading"} className="btn btn-white h-10 px-4 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
        </div>
      </div>
    </section>
  );
}
