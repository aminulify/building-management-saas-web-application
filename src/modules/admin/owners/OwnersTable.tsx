"use client";

import { AlertTriangle, Award, ChevronLeft, ChevronRight, Eye, Mail, Pencil, Phone, RefreshCw, Search, Star, Trash2, Users, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka, initialsOf } from "../dashboard/format";
import { day } from "../manage-home/format";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import type { AccountState, Mode, OwnerRow, StatusFilter, Tier, VerificationFilter } from "./types";
import type { useOwners } from "./use-owners";

export const STATE_STYLE: Record<AccountState, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700" };
export const PLAN_ICON: Record<string, { icon: LucideIcon; tone: string }> = { PRIMARY: { icon: Star, tone: "text-amber-500" }, MILLIONAIRE: { icon: Award, tone: "text-fuchsia-500" }, BILLIONAIRE: { icon: Zap, tone: "text-[#0A84F0]" } };
const TIERS: Tier[] = ["all", "PRIMARY", "MILLIONAIRE", "BILLIONAIRE"];
const STATUSES: StatusFilter[] = ["all", "ACTIVE", "WARNING", "SUSPENDED"];
const VERIFY: VerificationFilter[] = ["all", "VERIFIED", "PENDING", "REJECTED", "UNVERIFIED"];

export function Avatar({ name, url, size = "size-10" }: { name: string; url: string | null; size?: string }) {
  return url ? <img src={url} alt="" className={clsx(size, "shrink-0 rounded-full border border-white object-cover shadow-sm")} /> : <span aria-hidden className={clsx(size, "grid shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white")}>{initialsOf(name)}</span>;
}

interface RowProps { r: OwnerRow; index: number; mode: Mode; onView: (r: OwnerRow) => void; onEdit: (r: OwnerRow) => void; onDelete: (r: OwnerRow) => void }

function Row({ r, index, mode, onView, onEdit, onDelete }: RowProps) {
  const t = useTranslations("admin.owners.table");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const plan = r.plan ? PLAN_ICON[r.plan.code] ?? { icon: Star, tone: "text-slate-400" } : null;
  const PlanIcon = plan?.icon;
  const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3">
        <button type="button" onClick={() => onView(r)} aria-label={t("openProfile", { name: r.fullName })} className="group flex items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
          <Avatar name={r.fullName} url={r.avatarUrl} />
          <span className="min-w-0"><span className="block truncate font-semibold text-navy transition-colors duration-300 group-hover:text-[#0A84F0]">{r.fullName}</span><span className="block text-xs text-slate-500">{r.ownerCode ? t("ownerId", { code: r.ownerCode }) : `@${r.username}`}</span><span className={clsx("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[0.62rem] font-bold", VERIFY_STYLE[r.verification])}>{t(`verify.${r.verification}`)}</span></span>
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        <p className="flex max-w-[15rem] items-center gap-1.5 break-all"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{t("email")}: </span>{r.email ?? "—"}</p>
        <p className="flex items-center gap-1.5"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{t("phone")}: </span><span dir="ltr">{formatPhone(r.phone)}</span></p>
      </td>
      {mode === "rental" ? (
        <td className="whitespace-nowrap px-4 py-3 text-sm"><p className="font-semibold text-navy">{t("properties", { count: r.portfolio.properties })}</p><p className="text-xs text-slate-500">{t("units", { count: r.portfolio.units })}</p></td>
      ) : (
        <td className="whitespace-nowrap px-4 py-3 text-sm">
          <p className="font-semibold text-navy">{t("listings", { count: r.market?.total ?? 0 })}</p>
          <p className="text-xs text-slate-500">{t("forSaleSold", { sale: num(r.market?.forSale ?? 0), sold: num(r.market?.sold ?? 0) })}</p>
        </td>
      )}
      {mode === "market" && <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-navy">{formatTaka(locale)(r.market?.soldValue ?? 0)}</td>}
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-navy">
        {r.plan && PlanIcon ? <><PlanIcon className={clsx("mr-1.5 inline size-4 align-[-3px]", plan?.tone)} aria-hidden />{locale === "bn" ? r.plan.nameBn : r.plan.nameEn}</> : <span className="font-medium text-slate-400">{t("noPlan")}</span>}
      </td>
      <td className="px-4 py-3"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[r.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${r.state}`)}</span></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{day(locale, r.createdAt)}</td>
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

interface Props { mode: Mode; tier: Tier; onTier: (t: Tier) => void; status: StatusFilter; onStatus: (s: StatusFilter) => void; verification: VerificationFilter; onVerification: (v: VerificationFilter) => void; text: string; onText: (v: string) => void; pages: ReturnType<typeof useOwners>; onView: (r: OwnerRow) => void; onEdit: (r: OwnerRow) => void; onDelete: (r: OwnerRow) => void }

/** Plan tabs, search, the owners table (rental portfolio or marketplace figures) and "Showing 1 to 10 of N entries" with Previous / Next. */
export function OwnersTable({ mode, tier, onTier, status, onStatus, verification, onVerification, text, onText, pages, onView, onEdit, onDelete }: Props) {
  const t = useTranslations("admin.owners.table");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { data, state, page, setPage, reload } = pages;
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const total = data?.total ?? 0, size = data?.pageSize ?? 10;
  const from = total === 0 ? 0 : (page - 1) * size + 1, to = Math.min(page * size, total);
  const cols = mode === "rental" ? (["owner", "contact", "portfolio", "subscription", "status", "joined", "actions"] as const) : (["owner", "contact", "listings", "revenue", "subscription", "status", "joined", "actions"] as const);

  return (
    <section aria-labelledby="ow-table" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="ow-table" className="sr-only">{t(`title.${mode}`)}</h2>
        <div role="group" aria-label={t("filter")} className="flex w-full gap-1 overflow-x-auto rounded-xl border border-white/70 bg-white/60 p-1 backdrop-blur lg:w-auto">
          {TIERS.map((s) => (
            <button key={s} type="button" aria-pressed={tier === s} onClick={() => onTier(s)} className={clsx("relative flex-1 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-300 lg:flex-none", tier === s ? "text-white" : "text-slate-600 hover:text-[#0A84F0]")}>
              {tier === s && <motion.span layoutId="ow-tab" aria-hidden className="absolute inset-0 rounded-lg bg-[#0A84F0] shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" transition={{ duration: reduce ? 0 : 0.35 }} />}
              <span className="relative">{t(`tabs.${s}`)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="ow-verify" className="sr-only">{t("verifyLabel")}</label>
          <select id="ow-verify" value={verification} onChange={(e) => onVerification(e.target.value as VerificationFilter)} className="glass-input h-11 min-w-36 rounded-xl px-3 text-sm font-semibold text-navy outline-none">
            {VERIFY.map((x) => <option key={x} value={x}>{x === "all" ? `${t("verifyLabel")}: ${t("tabs.all")}` : t(`verify.${x}`)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ow-status" className="sr-only">{t("statusLabel")}</label>
          <select id="ow-status" value={status} onChange={(e) => onStatus(e.target.value as StatusFilter)} className="glass-input h-11 min-w-36 rounded-xl px-3 text-sm font-semibold text-navy outline-none">
            {STATUSES.map((x) => <option key={x} value={x}>{x === "all" ? `${t("statusLabel")}: ${t("tabs.all")}` : t(`state.${x}`)}</option>)}
          </select>
        </div>
        <div className="glass-input flex h-11 min-w-0 items-center gap-2 rounded-xl px-3 lg:w-72">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden /><label htmlFor="ow-search" className="sr-only">{t("searchLabel")}</label>
          <input id="ow-search" type="search" value={text} maxLength={80} autoComplete="off" onChange={(e) => onText(e.target.value)} placeholder={t("searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
        </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <caption className="sr-only">{t(`title.${mode}`)}</caption>
          <thead className="bg-white/85"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{cols.map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={cols.length} className="px-4 py-3"><div className="skeleton h-12 w-full" /></td></tr>)}
            {state !== "loading" && data?.items.map((r, i) => <Row key={r.id} r={r} index={i} mode={mode} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Users className="size-6" /></span>
            <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(tier !== "all" || status !== "all" || verification !== "all" || text ? "empty.filtered" : `empty.${mode}`)}</p></div>
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
