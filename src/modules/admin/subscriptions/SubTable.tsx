"use client";

import { AlertTriangle, Award, ChevronLeft, ChevronRight, Eye, Mail, MessageCircle, Phone, RefreshCw, Search, Star, Users, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import type { PlanFilter, StatusFilter, SubRow, SubState } from "./types";
import type { useSubscriptions } from "./use-subscriptions";

export const STATE_STYLE: Record<SubState, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", EXPIRING: "bg-yellow-100 text-yellow-700", EXPIRED: "bg-red-100 text-red-700" };
export const PLAN_ICON: Record<string, { icon: LucideIcon; tone: string }> = { PRIMARY: { icon: Star, tone: "text-amber-500" }, MILLIONAIRE: { icon: Award, tone: "text-fuchsia-500" }, BILLIONAIRE: { icon: Zap, tone: "text-[#0A84F0]" } };
const PLANS: PlanFilter[] = ["all", "PRIMARY", "MILLIONAIRE", "BILLIONAIRE"];
const STATUSES: StatusFilter[] = ["all", "ACTIVE", "EXPIRING", "EXPIRED"];

function Row({ r, index, onView, onMessage }: { r: SubRow; index: number; onView: (r: SubRow) => void; onMessage: (r: SubRow) => void }) {
  const t = useTranslations("admin.subs.table");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const plan = PLAN_ICON[r.plan.code] ?? PLAN_ICON.PRIMARY!, PlanIcon = plan.icon;
  const btn = "inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-[#48BDFA] hover:text-[#0A84F0] focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0";
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 align-middle transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3">
        <button type="button" onClick={() => onView(r)} aria-label={t("openProfile", { name: r.owner.fullName })} className="group flex items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
          <Avatar name={r.owner.fullName} url={r.owner.avatarUrl} />
          <span className="min-w-0"><span className="block truncate font-semibold text-navy transition-colors duration-300 group-hover:text-[#0A84F0]">{r.owner.fullName}</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">{r.owner.ownerCode ? t("ownerId", { code: r.owner.ownerCode }) : ""}<Phone className="size-3 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(r.owner.phone)}</span></span></span>
        </button>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-navy"><PlanIcon className={clsx("mr-1.5 inline size-4 align-[-3px]", plan.tone)} aria-hidden />{locale === "bn" ? r.plan.nameBn : r.plan.nameEn}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm"><p className="font-semibold text-navy">{t("properties", { count: r.usage.properties })}</p><p className="text-xs text-slate-500">{t("units", { n: num(r.usage.units) })}</p></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm"><p className="font-semibold text-navy">{t("months", { count: r.months })}</p><p className={clsx("text-xs font-semibold", r.paid ? "text-emerald-600" : "text-amber-600")}>({t(r.paid ? "paid" : "unpaid")})</p></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm">
        <p className="text-slate-700">{r.endsAt ? day(locale, r.endsAt) : "—"}</p>
        <span className={clsx("mt-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[r.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${r.state}`)}</span>
        {r.state === "EXPIRING" && r.daysLeft !== null && <span className="ml-1.5 text-[0.68rem] text-yellow-700">{t("daysLeft", { n: num(Math.max(0, r.daysLeft)) })}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => onMessage(r)} aria-label={t("messageAria", { name: r.owner.fullName })} title={t("message")} className={btn}><MessageCircle className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onView(r)} aria-label={t("viewAria", { name: r.owner.fullName })} title={t("view")} className={btn}><Eye className="size-4" aria-hidden /></button>
        </div>
      </td>
    </motion.tr>
  );
}

interface Props { plan: PlanFilter; onPlan: (p: PlanFilter) => void; status: StatusFilter; onStatus: (s: StatusFilter) => void; text: string; onText: (v: string) => void; pages: ReturnType<typeof useSubscriptions>; onView: (r: SubRow) => void; onMessage: (r: SubRow) => void }

/** Package and Status filters, Owner ID search, the plans table and "Showing 10 of N entries" with Previous / Next. */
export function SubTable({ plan, onPlan, status, onStatus, text, onText, pages, onView, onMessage }: Props) {
  const t = useTranslations("admin.subs.table");
  const locale = useLocale();
  const { data, state, page, setPage, reload } = pages;
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const total = data?.total ?? 0, size = data?.pageSize ?? 10;
  const shown = Math.min(page * size, total);
  const sel = "glass-input h-11 min-w-40 rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <section aria-labelledby="sub-table" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="sub-table" className="sr-only">{t("title")}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="sub-plan" className="sr-only">{t("packageLabel")}</label>
          <select id="sub-plan" value={plan} onChange={(e) => onPlan(e.target.value as PlanFilter)} className={sel}>{PLANS.map((p) => <option key={p} value={p}>{p === "all" ? t("allPackages") : t(`plans.${p}`)}</option>)}</select>
          <label htmlFor="sub-status" className="sr-only">{t("statusLabel")}</label>
          <select id="sub-status" value={status} onChange={(e) => onStatus(e.target.value as StatusFilter)} className={sel}>{STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? t("allStatuses") : t(`state.${s}`)}</option>)}</select>
        </div>
        <div className="glass-input flex h-11 min-w-0 items-center gap-2 rounded-xl px-3 lg:w-80">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden /><label htmlFor="sub-search" className="sr-only">{t("searchLabel")}</label>
          <input id="sub-search" type="search" value={text} maxLength={60} autoComplete="off" onChange={(e) => onText(e.target.value)} placeholder={t("searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="bg-white/85"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{(["owner", "package", "usage", "subscription", "status", "actions"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={6} className="px-4 py-3"><div className="skeleton h-12 w-full" /></td></tr>)}
            {state !== "loading" && data?.items.map((r, i) => <Row key={r.id} r={r} index={i} onView={onView} onMessage={onMessage} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Users className="size-6" /></span>
            <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(plan !== "all" || status !== "all" || text ? "empty.filtered" : "empty.none")}</p></div>
        )}
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 sm:flex-row sm:px-6">
        <p aria-live="polite" className="text-sm text-slate-600">{state === "ready" ? t("showing", { shown: num(shown), total: num(total) }) : "…"}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1 || state === "loading"} className="btn btn-white h-10 px-4 text-sm"><ChevronLeft className="size-4" aria-hidden />{t("previous")}</button>
          <button type="button" onClick={() => setPage(page + 1)} disabled={shown >= total || state === "loading"} className="btn btn-white h-10 px-4 text-sm">{t("next")}<ChevronRight className="size-4" aria-hidden /></button>
        </div>
      </div>
    </section>
  );
}
