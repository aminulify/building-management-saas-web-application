"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Award, ChevronDown, Loader2, RefreshCw, Star, Users, Zap, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatCount, initialsOf } from "./format";
import type { PlanRow, PlanStatus, Segment } from "./types";
import { FIRST_PAGE, NEXT_PAGE, usePlanPages } from "./use-plan-pages";

const SEGMENTS: Segment[] = ["all", "owners", "tenants", "free"];
const ROLE_STYLE: Record<PlanRow["role"], string> = { OWNER: "bg-sky-100 text-sky-700", TENANT: "bg-emerald-100 text-emerald-700", GENERAL_USER: "bg-violet-100 text-violet-700" };
const STATUS_STYLE: Record<PlanStatus, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", NONE: "bg-slate-200 text-slate-600", SUSPENDED: "bg-red-100 text-red-700" };
const PLAN_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  PRIMARY: { icon: Star, tone: "text-amber-500" },
  MILLIONAIRE: { icon: Award, tone: "text-fuchsia-500" },
  BILLIONAIRE: { icon: Zap, tone: "text-[#0A84F0]" },
};

function Row({ r, index }: { r: PlanRow; index: number }) {
  const t = useTranslations("admin.dashboard.plans");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const plan = r.plan ? PLAN_ICON[r.plan.code] ?? { icon: Star, tone: "text-slate-400" } : null;
  const PlanIcon = plan?.icon;
  return (
    <motion.tr
      initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 9) * 0.03 }}
      className="border-t border-slate-200/70 transition-colors duration-300 hover:bg-white/60"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="size-9 shrink-0 rounded-full border border-white object-cover shadow-sm" /> : <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">{initialsOf(r.fullName)}</span>}
          <div className="min-w-0"><p className="truncate font-semibold text-navy">{r.fullName}</p><p className="truncate text-xs text-slate-500">{r.email ?? `@${r.username}`}</p></div>
        </div>
      </td>
      <td className="px-4 py-3"><span className={clsx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", ROLE_STYLE[r.role])}>{t(`roles.${r.role}`)}</span></td>
      <td className="px-4 py-3 text-sm text-slate-700">{r.propertyType ? t(`types.${r.propertyType}`) : t("na")}</td>
      <td className="px-4 py-3 text-sm font-semibold text-navy">
        {r.plan && PlanIcon ? <span className="inline-flex items-center gap-1.5"><PlanIcon className={clsx("size-4", plan?.tone)} aria-hidden />{locale === "bn" ? r.plan.nameBn : r.plan.nameEn}</span> : <span className="font-medium text-slate-400">{t("na")}</span>}
      </td>
      <td className="px-4 py-3"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_STYLE[r.status])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`status.${r.status}`)}</span></td>
    </motion.tr>
  );
}

/** "Active Plans": the people on the platform by role, 9 rows first, 10 more per "View More" with the list scrolling inside its card. */
export function ActivePlans() {
  const t = useTranslations("admin.dashboard.plans");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const [segment, setSegment] = useState<Segment>("all");
  const { items, total, state, more, hasMore, loadMore, reload } = usePlanPages(segment);
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(0);

  useEffect(() => { setExpanded(false); }, [segment]);

  // after "View More": slide down to the first new row inside the card, never move the page
  useEffect(() => {
    if (!expanded || !box.current || more !== "idle" || !before.current) return;
    box.current.scrollTo({ top: before.current, behavior: reduce ? "auto" : "smooth" });
    before.current = 0;
  }, [items.length, expanded, more, reduce]);

  const onMore = () => { before.current = box.current?.scrollHeight ?? 0; setExpanded(true); loadMore(); };

  return (
    <section aria-labelledby="plans-title" className="glass-card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h2 id="plans-title" className="text-xl font-bold text-navy">{t("title")}</h2>
        <div role="group" aria-label={t("filter")} className="flex w-full gap-1 rounded-xl border border-white/70 bg-white/60 p-1 backdrop-blur sm:w-auto">
          {SEGMENTS.map((s) => (
            <button key={s} type="button" aria-pressed={segment === s} onClick={() => setSegment(s)}
              className={clsx("relative flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-300 sm:flex-none sm:px-4", segment === s ? "text-white" : "text-slate-600 hover:text-[#0A84F0]")}>
              {segment === s && <motion.span layoutId="plans-seg" aria-hidden className="absolute inset-0 rounded-lg bg-[#0A84F0] shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" transition={{ duration: reduce ? 0 : 0.35 }} />}
              <span className="relative">{t(`segments.${s}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={box} className={clsx("overflow-x-auto", expanded && "max-h-[min(26rem,65vh)] overflow-y-auto [scrollbar-width:thin]")} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? t("scrollArea") : undefined}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur">
            <tr className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">
              {(["user", "role", "propertyType", "plan", "status"] as const).map((c) => <th key={c} scope="col" className="px-4 py-3">{t(`columns.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {state === "loading" && Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-slate-200/70"><td colSpan={5} className="px-4 py-3"><div className="skeleton h-9 w-full" /></td></tr>)}
            {state === "ready" && items.map((r, i) => <Row key={r.id} r={r} index={i >= FIRST_PAGE ? (i - FIRST_PAGE) % NEXT_PAGE : i} />)}
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
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sky-100 text-sky-600"><Users className="size-6" /></span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(`empty.${segment}`)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state === "ready" && items.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 px-4 py-3 sm:flex-row sm:px-6">
          <p aria-live="polite" className="text-xs text-slate-500">{t("showing", { shown: formatCount(locale)(items.length), total: formatCount(locale)(total) })}</p>
          {more === "error" && <p role="alert" className="text-xs font-medium text-red-600">{t("moreError")}</p>}
          {hasMore && (
            <button type="button" onClick={onMore} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-100/70 disabled:opacity-60">
              {more === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{more === "loading" ? t("loadingMore") : t("viewMore")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
