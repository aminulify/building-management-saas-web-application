"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, Eye, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import type { AdminPropertyState } from "./status";
import type { PropertyRow, Tab } from "./types";
import { FIRST_PAGE, NEXT_PAGE, type usePropertyPages } from "./use-property-pages";

const TABS: Tab[] = ["all", "active", "pending"];
export const STATE_STYLE: Record<AdminPropertyState, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", REJECTED: "bg-red-100 text-red-700", SUSPENDED: "bg-slate-200 text-slate-600" };

export function StateBadge({ state }: { state: AdminPropertyState }) {
  const t = useTranslations("admin.properties.state");
  return <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(state)}</span>;
}

function Row({ r, index, onView, onEdit, onDelete }: { r: PropertyRow; index: number; onView: (r: PropertyRow) => void; onEdit: (r: PropertyRow) => void; onDelete: (r: PropertyRow) => void }) {
  const t = useTranslations("admin.properties");
  const reduce = useReducedMotion();
  const btn = "grid size-9 place-items-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#48BDFA] hover:text-[#0A84F0] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  return (
    <motion.tr
      initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }}
      className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60"
    >
      <td className="px-4 py-3"><p className="font-semibold text-navy">{r.name}</p><p className="text-xs text-slate-500">({t(`types.${r.type}`)})</p></td>
      <td className="px-4 py-3"><p className="font-medium text-navy">{r.owner.fullName}</p><p className="text-xs text-slate-500">{formatPhone(r.owner.phone)}</p></td>
      <td className="px-4 py-3 text-sm text-slate-700">{r.location || "—"}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700"><span className="font-semibold text-navy">{t("units", { count: r.totalUnits })}</span> <span className="text-xs text-slate-500">({t("occupied", { count: r.occupiedUnits })})</span></td>
      <td className="px-4 py-3"><StateBadge state={r.state} /></td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => onEdit(r)} aria-label={t("editAria", { name: r.name })} title={t("editBtn")} className={btn}><Pencil className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { name: r.name })} title={t("viewBtn")} className={btn}><Eye className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onDelete(r)} aria-label={t("deleteAria", { name: r.name })} title={t("deleteBtn")} className={`${btn} hover:!border-red-300 hover:!text-red-600`}><Trash2 className="size-4" aria-hidden /></button>
        </div>
      </td>
    </motion.tr>
  );
}

interface Props { tab: Tab; onTab: (t: Tab) => void; pages: ReturnType<typeof usePropertyPages>; onView: (r: PropertyRow) => void; onEdit: (r: PropertyRow) => void; onDelete: (r: PropertyRow) => void }

/** The All Properties card: tabs, summary, table (9 rows first, 10 more per "View More", scrolling inside the card). */
export function PropertyTable({ tab, onTab, pages, onView, onEdit, onDelete }: Props) {
  const t = useTranslations("admin.properties");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { items, total, state, more, hasMore, loadMore, reload } = pages;
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

  useEffect(() => { setExpanded(false); }, [tab]);
  // after "View More": slide to the first new row inside the card, the page itself stays still
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);
  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };

  return (
    <section aria-labelledby="props-title" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h2 id="props-title" className="sr-only">{t("tableTitle")}</h2>
        <div role="group" aria-label={t("filter")} className="flex w-full gap-1 rounded-xl border border-white/70 bg-white/60 p-1 backdrop-blur sm:w-auto">
          {TABS.map((s) => (
            <button key={s} type="button" aria-pressed={tab === s} onClick={() => onTab(s)}
              className={clsx("relative flex-1 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-300 sm:flex-none sm:px-5", tab === s ? "text-white" : "text-slate-600 hover:text-[#0A84F0]")}>
              {tab === s && <motion.span layoutId="props-tab" aria-hidden className="absolute inset-0 rounded-lg bg-[#0A84F0] shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" transition={{ duration: reduce ? 0 : 0.35 }} />}
              <span className="relative">{t(`tabs.${s}`)}</span>
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-sm font-semibold text-navy">{t("summary", { total: state === "ready" ? num(total) : "…" })}</p>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(28rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">{t("tableTitle")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur">
            <tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">
              {(["name", "owner", "location", "units", "status", "actions"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={6} className="px-4 py-3"><div className="skeleton h-10 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
          </tbody>
        </table>

        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}
        <AnimatePresence>
          {state === "ready" && items.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-sky-600"><Building2 className="size-6" /></span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(`empty.${tab}`)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state === "ready" && items.length > 0 && (hasMore || more === "error") && (
        <div className="flex flex-col items-center justify-center gap-2 border-t border-slate-200/70 px-4 py-3">
          {more === "error" && <p role="alert" className="text-xs font-medium text-red-600">{t("moreError")}</p>}
          <button type="button" onClick={onMore} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-100/70 disabled:opacity-60">
            {more === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{more === "loading" ? t("loadingMore") : t("viewMore")}
          </button>
        </div>
      )}
    </section>
  );
}
