"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Eye, ImageOff, Loader2, Mail, Pencil, Phone, RefreshCw, Search, Trash2, X, Zap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { ago, day, taka } from "../manage-home/format";
import { PAY_STYLE, STATE_STYLE } from "./BoostDetails";
import type { BoostRow, BoostState, BoostTab } from "./types";
import { FIRST_PAGE, NEXT_PAGE, type useBoostPages } from "./use-boost-pages";

const TABS: BoostTab[] = ["all", "active", "expired", "failed"];

function Row({ r, index, onView, onEdit, onDelete, onApprove, onReject }: { r: BoostRow; index: number; onView: (r: BoostRow) => void; onEdit: (r: BoostRow) => void; onDelete: (r: BoostRow) => void; onApprove: (r: BoostRow) => void; onReject: (r: BoostRow) => void }) {
  const t = useTranslations("admin.paidBoost");
  const tm = useTranslations("admin.manageHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {r.listing.thumbnailUrl ? <img src={r.listing.thumbnailUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl border border-white object-cover shadow-sm" /> : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImageOff className="size-5" /></span>}
          <div className="min-w-0"><p className="max-w-[15rem] truncate font-semibold text-navy" title={r.listing.title}>{r.listing.title}</p><p className="text-xs text-slate-500">{taka(locale, r.listing.price)} · {ago(locale, r.createdAt, tm("justNow"))}</p></div>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-navy">{r.user.fullName}{r.user.ownerCode && <span className="ml-1.5 text-[0.68rem] font-bold text-[#0A84F0]">{r.user.ownerCode}</span>}</p>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{tm("phone")}: </span>{formatPhone(r.user.phone)}</p>
        <p className="flex max-w-[14rem] items-center gap-1.5 break-all text-xs text-slate-500"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{tm("email")}: </span>{r.user.email ?? "—"}</p>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        <p className="text-sm font-bold text-navy">{taka(locale, r.amount)} <span className="font-medium text-slate-500">· bKash</span></p>
        <p className="font-mono">{r.trxId}</p><p dir="ltr">{formatPhone(r.senderNumber)}</p>
        <span className={clsx("mt-1 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold", PAY_STYLE[r.paymentStatus ?? "INITIATED"])}>{t(`payment.${r.paymentStatus ?? "INITIATED"}`)}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{r.startsAt && r.endsAt ? <><p>{day(locale, r.startsAt)}</p><p>→ {day(locale, r.endsAt)}</p></> : <p>{t("days", { count: r.durationDays })}</p>}</td>
      <td className="px-4 py-3"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[r.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${r.state}`)}</span>{r.rejectionReason && <p className="mt-1 max-w-[12rem] text-[0.68rem] text-red-600">{r.rejectionReason}</p>}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { title: r.listing.title })} title={t("view")} className={clsx(btn, "border-slate-200 bg-white/80 text-slate-600 hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Eye className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onEdit(r)} aria-label={t("editAria", { title: r.listing.title })} title={t("edit")} className={clsx(btn, "border-slate-200 bg-white/80 text-slate-600 hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Pencil className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onDelete(r)} aria-label={t("deleteAria", { title: r.listing.title })} title={t("delete")} className={clsx(btn, "border-slate-200 bg-white/80 text-slate-600 hover:border-red-300 hover:text-red-600")}><Trash2 className="size-4" aria-hidden /></button>
          {r.state === "PENDING" && <>
            <button type="button" onClick={() => onApprove(r)} title={t("approve")} className={clsx(btn, "border-emerald-300 bg-emerald-50 text-emerald-700")}><Check className="size-4" aria-hidden /><span className="sr-only">{t("approve")}</span></button>
            <button type="button" onClick={() => onReject(r)} title={t("reject")} className={clsx(btn, "border-red-200 bg-white/80 text-red-600")}><X className="size-4" aria-hidden /><span className="sr-only">{t("reject")}</span></button>
          </>}
        </div>
      </td>
    </motion.tr>
  );
}

interface Props { tab: BoostTab; onTab: (t: BoostTab) => void; search: string; onSearch: (v: string) => void; pages: ReturnType<typeof useBoostPages>; onView: (r: BoostRow) => void; onEdit: (r: BoostRow) => void; onDelete: (r: BoostRow) => void; onApprove: (r: BoostRow) => void; onReject: (r: BoostRow) => void }

/** Boost requests: status tabs, search, and a table (10 rows first, 10 more per "View More", scrolling inside the card). */
export function BoostTable({ tab, onTab, search, onSearch, pages, onView, onEdit, onDelete, onApprove, onReject }: Props) {
  const t = useTranslations("admin.paidBoost");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { items, total, state, more, hasMore, loadMore, reload } = pages;
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

  useEffect(() => { setExpanded(false); }, [tab, search]);
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);
  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };

  return (
    <section aria-labelledby="pb-table" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6">
        <h2 id="pb-table" className="sr-only">{t("tableTitle")}</h2>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label={t("filter")} className="flex w-full gap-1 overflow-x-auto rounded-xl border border-white/70 bg-white/60 p-1 backdrop-blur lg:w-auto">
            {TABS.map((s) => (
              <button key={s} type="button" aria-pressed={tab === s} onClick={() => onTab(s)} className={clsx("relative flex-1 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-300 lg:flex-none", tab === s ? "text-white" : "text-slate-600 hover:text-[#0A84F0]")}>
                {tab === s && <motion.span layoutId="pb-tab" aria-hidden className="absolute inset-0 rounded-lg bg-[#0A84F0] shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" transition={{ duration: reduce ? 0 : 0.35 }} />}
                <span className="relative">{t(`tabs.${s}`)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 lg:w-80">
              <Search className="size-4 shrink-0 text-slate-400" aria-hidden /><label htmlFor="pb-search" className="sr-only">{t("searchLabel")}</label>
              <input id="pb-search" type="search" value={search} maxLength={80} autoComplete="off" onChange={(e) => onSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
            </div>
            <p aria-live="polite" className="whitespace-nowrap text-sm font-semibold text-navy">{t("summary", { total: state === "ready" ? num(total) : "…" })}</p>
          </div>
        </div>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(32rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className="w-full min-w-[1000px] text-left text-sm">
          <caption className="sr-only">{t("tableTitle")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{(["listing", "owner", "payment", "period", "status", "actions"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={6} className="px-4 py-3"><div className="skeleton h-14 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} onView={onView} onEdit={onEdit} onDelete={onDelete} onApprove={onApprove} onReject={onReject} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        <AnimatePresence>
          {state === "ready" && items.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-600"><Zap className="size-6" /></span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(search || tab !== "all" ? "empty.filtered" : "empty.none")}</p>
            </motion.div>
          )}
        </AnimatePresence>
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
