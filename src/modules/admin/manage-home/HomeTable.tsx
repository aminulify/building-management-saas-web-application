"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Eye, Home, ImageOff, Loader2, Mail, Pencil, Phone, RefreshCw, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import type { ModerationState } from "./state";
import { ago, areaText, taka } from "./format";
import type { HomeFilters, HomeRow, OccupancyFilter, SaleFilter, StatusFilter } from "./types";
import { FIRST_PAGE, NEXT_PAGE, type useHomePages } from "./use-home-pages";

const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "pending", "reported", "rejected"];
const OCCUPANCY_OPTIONS: OccupancyFilter[] = ["all", "occupied", "vacant"];
const SALE_OPTIONS: SaleFilter[] = ["all", "for_sale", "sold"];
export const STATE_STYLE: Record<ModerationState, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", REPORTED: "bg-red-100 text-red-700", REJECTED: "bg-slate-200 text-slate-600" };

export function HomeBadge({ state }: { state: ModerationState }) {
  const t = useTranslations("admin.manageHome.state");
  return <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(state)}</span>;
}

function Select({ id, label, value, onChange, disabled, children }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={clsx("glass-input relative flex h-11 items-center rounded-xl pl-3 pr-8 transition-opacity duration-300", disabled && "opacity-50")}>
      <span className="mr-2 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-label">{label}</span>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-2 text-sm font-semibold text-navy outline-none disabled:cursor-not-allowed">{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
    </label>
  );
}

interface RowProps { r: HomeRow; mode: HomeFilters["mode"]; index: number; onView: (r: HomeRow) => void; onEdit: (r: HomeRow) => void; onDelete: (r: HomeRow) => void }

function Row({ r, mode, index, onView, onEdit, onDelete }: RowProps) {
  const t = useTranslations("admin.manageHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const btn = "grid size-9 place-items-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  const owner = <><p className="font-medium text-navy">{r.owner.fullName}</p><p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{t("phone")}: </span>{formatPhone(r.owner.phone)}</p><p className="flex max-w-[14rem] items-center gap-1.5 break-all text-xs text-slate-500"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{t("email")}: </span>{r.owner.email ?? "—"}</p></>;
  return (
    <motion.tr
      initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }}
      className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {mode === "rent" && (r.thumbnailUrl
            ? <img src={r.thumbnailUrl} alt={t("previewAlt", { title: r.title })} loading="lazy" className="size-12 shrink-0 rounded-xl border border-white object-cover shadow-sm" />
            : <span aria-label={t("noPreview")} className="grid size-12 shrink-0 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImageOff className="size-5" aria-hidden /></span>)}
          <div className="min-w-0"><p className="max-w-[16rem] truncate font-semibold text-navy" title={r.title}>{r.title}</p><p className="text-xs text-slate-500">({ago(locale, r.createdAt, t("justNow"))})</p></div>
        </div>
      </td>
      {mode === "sale" && (
        <td className="px-4 py-3">
          {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt={t("previewAlt", { title: r.title })} loading="lazy" className="h-14 w-20 rounded-lg border border-white object-cover shadow-sm" /> : <span aria-label={t("noPreview")} className="grid h-14 w-20 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImageOff className="size-5" aria-hidden /></span>}
        </td>
      )}
      <td className="px-4 py-3">{owner}</td>
      <td className="px-4 py-3 text-sm text-slate-700">{r.location || "—"}</td>
      {mode === "sale" && <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{r.area ? areaText(locale, r.area, r.areaUnit, t("sqft")) : "—"}</td>}
      <td className="whitespace-nowrap px-4 py-3 font-semibold text-navy">{mode === "rent" ? t("perMonth", { price: taka(locale, r.price) }) : taka(locale, r.price)}</td>
      {mode === "sale" && <td className="px-4 py-3"><span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold", r.sold ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700")}>{t(r.sold ? "sale.sold" : "sale.forSale")}</span></td>}
      <td className="px-4 py-3"><HomeBadge state={r.state} />{r.openReports > 0 && <p className="mt-1 text-[0.68rem] font-semibold text-red-600">{t("openReports", { count: r.openReports })}</p>}</td>
      {mode === "rent" && <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-navy">{t(r.occupied ? "occupied" : "vacant")}</td>}
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { title: r.title })} title={t("viewBtn")} className={clsx(btn, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Eye className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onEdit(r)} aria-label={t("editAria", { title: r.title })} title={t("editBtn")} className={clsx(btn, "hover:border-[#9333EA] hover:text-[#9333EA]")}><Pencil className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onDelete(r)} aria-label={t("deleteAria", { title: r.title })} title={t("deleteBtn")} className={clsx(btn, "hover:border-red-400 hover:text-red-600")}><Trash2 className="size-4" aria-hidden /></button>
        </div>
      </td>
    </motion.tr>
  );
}

interface Props { filters: HomeFilters; onFilters: (f: HomeFilters) => void; pages: ReturnType<typeof useHomePages>; onView: (r: HomeRow) => void; onEdit: (r: HomeRow) => void; onDelete: (r: HomeRow) => void }

/** Filter toolbar + the table of the current mode (9 rows first, 10 more per "View More", scrolling inside the card). */
export function HomeTable({ filters, onFilters, pages, onView, onEdit, onDelete }: Props) {
  const t = useTranslations("admin.manageHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { items, total, state, more, hasMore, loadMore, reload } = pages;
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const rent = filters.mode === "rent";
  const cols = rent ? (["details", "owner", "location", "price", "status", "occupancy", "actions"] as const) : (["name", "preview", "ownerDetails", "location", "sqft", "sellingPrice", "saleStatus", "moderation", "actions"] as const);
  // occupancy only makes sense for approved or reported listings: a pending or rejected one is never occupied
  const occupancyLocked = filters.status === "pending" || filters.status === "rejected";
  const key = `${filters.mode}|${filters.status}|${filters.occupancy}|${filters.sale}`;

  useEffect(() => { setExpanded(false); }, [key]);
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);
  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };

  return (
    <section aria-labelledby="home-title" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="home-title" className="sr-only">{t(rent ? "rentalTitle" : "marketTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem]">
          <Select id="mh-status" label={t("filters.status")} value={filters.status} onChange={(v) => onFilters({ ...filters, status: v as StatusFilter, occupancy: v === "pending" || v === "rejected" ? "all" : filters.occupancy, sale: filters.sale })}>
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{t(`filters.statusOptions.${o}`)}</option>)}
          </Select>
          {rent ? (
            <Select id="mh-occupancy" label={t("filters.occupancy")} value={filters.occupancy} disabled={occupancyLocked} onChange={(v) => onFilters({ ...filters, occupancy: v as OccupancyFilter })}>
              {OCCUPANCY_OPTIONS.map((o) => <option key={o} value={o}>{t(`filters.occupancyOptions.${o}`)}</option>)}
            </Select>
          ) : (
            <Select id="mh-sale" label={t("filters.sale")} value={filters.sale} onChange={(v) => onFilters({ ...filters, sale: v as SaleFilter })}>
              {SALE_OPTIONS.map((o) => <option key={o} value={o}>{t(`filters.saleOptions.${o}`)}</option>)}
            </Select>
          )}
        </div>
        <p aria-live="polite" className="text-sm font-semibold text-navy">{t("summary", { total: state === "ready" ? num(total) : "…" })}</p>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(30rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className={clsx("w-full text-left text-sm", rent ? "min-w-[980px]" : "min-w-[1180px]")}>
          <caption className="sr-only">{t(rent ? "rentalTitle" : "marketTitle")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur">
            <tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{cols.map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr>
          </thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={cols.length} className="px-4 py-3"><div className="skeleton h-12 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} mode={filters.mode} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
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
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-sky-600"><Home className="size-6" /></span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(filters.status === "all" && filters.occupancy === "all" && filters.sale === "all" ? `empty.${filters.mode}` : "empty.filtered")}</p>
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
