"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Award, ChevronDown, Loader2, ReceiptText, RefreshCw, Rocket, Star, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatDay, formatTaka } from "../dashboard/format";
import type { ReportPlans, TxnFilter, TxnRow, TxnStatus } from "./types";
import { FIRST_PAGE, NEXT_PAGE, type useTransactions } from "./use-transactions";

const FILTERS: TxnFilter[] = ["all", "active", "failed"];
const STATUS: Record<TxnStatus, { key: string; style: string }> = {
  SUCCESS: { key: "active", style: "bg-emerald-100 text-emerald-700" },
  FAILED: { key: "failed", style: "bg-red-100 text-red-700" },
  PENDING_REVIEW: { key: "pending", style: "bg-amber-100 text-amber-700" },
  INITIATED: { key: "pending", style: "bg-amber-100 text-amber-700" },
  REFUNDED: { key: "refunded", style: "bg-sky-100 text-sky-700" },
};
const PLAN_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  PRIMARY: { icon: Star, tone: "text-amber-500" },
  MILLIONAIRE: { icon: Award, tone: "text-fuchsia-500" },
  BILLIONAIRE: { icon: Zap, tone: "text-[#0A84F0]" },
};

function Row({ r, index }: { r: TxnRow; index: number }) {
  const t = useTranslations("admin.report.transactions");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const boost = r.purpose === "PROMOTION";
  const look = boost ? { icon: Rocket, tone: "text-orange-500" } : r.plan ? PLAN_ICON[r.plan.code] ?? { icon: Star, tone: "text-slate-400" } : null;
  const Icon = look?.icon;
  const st = STATUS[r.status];
  return (
    <motion.tr initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }} className="border-t border-slate-200/70 transition-colors duration-300 hover:bg-white/60">
      <td className="px-4 py-3"><p className="font-mono text-sm font-semibold text-navy">{r.gatewayTxnId}</p><p className="text-xs text-slate-500">{formatTaka(locale)(Number(r.amount))}</p></td>
      <td className="px-4 py-3 text-sm"><span className="font-semibold text-navy">{r.owner.fullName}</span> <span className="text-slate-500">({t(`roles.${r.owner.role}`)})</span></td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-navy">
        {Icon && <Icon className={clsx("mr-1.5 inline size-4 align-[-3px]", look?.tone)} aria-hidden />}
        {boost ? t("boost") : r.plan ? (locale === "bn" ? r.plan.nameBn : r.plan.nameEn) : t("noPlan")}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDay(locale, new Date(new Date(r.createdAt).getTime() + 6 * 3600_000).toISOString().slice(0, 10))}</td>
      <td className="px-4 py-3"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", st.style)}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`status.${st.key}`)}</span></td>
    </motion.tr>
  );
}

interface Props { filter: TxnFilter; onFilter: (f: TxnFilter) => void; plan: string; onPlan: (p: string) => void; plans: ReportPlans | null; pages: ReturnType<typeof useTransactions> }

/** Recent Transactions: a status filter, 9 rows first, then 10 more per click with the list scrolling inside its card. */
export function TransactionsTable({ filter, onFilter, plan, onPlan, plans, pages }: Props) {
  const locale = useLocale();
  const t = useTranslations("admin.report.transactions");
  const reduce = useReducedMotion();
  const { items, state, more, hasMore, loadMore, reload } = pages;
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);

  useEffect(() => { setExpanded(false); }, [filter, plan]);
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);
  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };

  return (
    <section aria-labelledby="tx-title" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h2 id="tx-title" className="text-xl font-bold text-navy">{t("title")}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="tx-plan" className="text-sm font-semibold text-slate-600">{t("planLabel")}</label>
            <select id="tx-plan" value={plan} onChange={(e) => onPlan(e.target.value)} className="glass-input h-10 min-w-32 rounded-xl px-3 text-sm font-semibold text-navy outline-none">
              <option value="ALL">{t("planAll")}</option>
              {(plans?.items ?? []).map((p) => <option key={p.code} value={p.code}>{locale === "bn" ? p.nameBn : p.nameEn}</option>)}
              <option value="BOOST">{t("boost")}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
          <label htmlFor="tx-status" className="text-sm font-semibold text-slate-600">{t("statusLabel")}</label>
          <select id="tx-status" value={filter} onChange={(e) => onFilter(e.target.value as TxnFilter)} className="glass-input h-10 min-w-28 rounded-xl px-3 text-sm font-semibold text-navy outline-none">
            {FILTERS.map((f) => <option key={f} value={f}>{t(`filter.${f}`)}</option>)}
          </select>
          </div>
        </div>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(32rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur"><tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">{(["id", "owner", "plan", "date", "status"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}</tr></thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={5} className="px-4 py-3"><div className="skeleton h-10 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} />)}
          </tbody>
        </table>
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><ReceiptText className="size-6" /></span>
            <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(filter === "all" && plan === "ALL" ? "empty.none" : "empty.filtered")}</p></div>
        )}
      </div>

      {state === "ready" && items.length > 0 && (hasMore || more === "error") && (
        <div className="flex flex-col items-center gap-2 border-t border-slate-200/70 px-4 py-3">
          {more === "error" && <p role="alert" className="text-xs font-medium text-red-600">{t("moreError")}</p>}
          <button type="button" onClick={onMore} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-100/70 disabled:opacity-60">
            {more === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{more === "loading" ? t("loadingMore") : t("viewAll")}
          </button>
        </div>
      )}
    </section>
  );
}
