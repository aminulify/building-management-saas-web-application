"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, CheckCircle2, Clock, Loader2, PauseCircle, Plus, RefreshCw, Wrench } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../../owner/dashboard/format";
import type { TenantDashboard } from "../dashboard/types";
import { useTenant } from "../shell/TenantContext";
import { DeleteRequestModal } from "./DeleteRequestModal";
import { EditRequestModal, type Saved } from "./EditRequestModal";
import { NewRequestModal } from "./NewRequestModal";
import { RequestCard } from "./RequestCard";
import { cards as cardNumbers, inTab, moveStats, tabCount } from "./logic";
import { useRequests } from "./use-requests";
import type { Context, Issue, Stats, Tab } from "./types";

const TABS: Tab[] = ["all", "active", "completed"];

export function MaintenanceView() {
  const t = useTranslations("tenant.maintenance");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const { me } = useTenant();
  const n = formatNumber(locale);

  const [tab, setTab] = useState<Tab>("all");
  const issues = useRequests(tab);
  const statsQ = useAuthQuery<Stats>("/maintenance/stats");
  const dash = useAuthQuery<TenantDashboard>("/dashboard/tenant");
  const [stats, setStats] = useState<Stats | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [toDelete, setToDelete] = useState<Issue | null>(null);
  const [deleting, setDeleting] = useState(false);

  // the cards show the server's numbers, and move at once when a request is added, changed or removed
  useEffect(() => { if (statsQ.data) setStats(statsQ.data); }, [statsQ.data]);

  const tenancy = dash.data?.tenancy ?? null;
  const ctx: Context | null = tenancy ? { property: tenancy.property.name, unit: tenancy.unit.unitNumber, tenant: me.fullName } : null;
  const noLease = dash.state === "ready" && !tenancy;

  function created(issue: Issue) {
    if (stats) setStats(moveStats(stats, issue.priority, null, issue.status));
    if (inTab(tab, issue.status)) issues.prepend(issue);
    statsQ.reload();
  }

  function saved(s: Saved) {
    const issue = issues.items.find((i) => i.id === s.id) ?? editing;
    issues.patch(s.id, s.patch);
    if (stats && issue && s.from !== s.to) setStats(moveStats(stats, (s.patch.priority ?? issue.priority), s.from, s.to));
    if (!inTab(tab, s.to)) setTimeout(() => issues.remove(s.id), reduce ? 0 : 450); // leaves the tab it no longer belongs to
    statsQ.reload();
  }

  async function confirmDelete(issue: Issue) {
    setDeleting(true);
    try {
      await authApi(`/maintenance/${issue.id}`, { method: "DELETE" });
      issues.remove(issue.id);
      if (stats) setStats(moveStats(stats, issue.priority, issue.status, null));
      statsQ.reload();
      setToDelete(null);
      toast("success", t("toast.deleted"));
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_STATE") { setToDelete(null); toast("error", t("toast.inProgress")); }
      else toast("error", t("toast.error"));
    } finally { setDeleting(false); }
  }

  const c = stats ? cardNumbers(stats) : null;
  const metric = [
    { key: "active", label: t("stats.active"), value: c?.active, icon: Clock, tone: "text-[#0A84F0]", badge: "bg-[#EFF6FF] text-[#0A84F0]" },
    { key: "completed", label: t("stats.completed"), value: c?.completed, icon: CheckCircle2, tone: "text-green-600", badge: "bg-[#F0FDF4] text-green-600" },
    { key: "pending", label: t("stats.pending"), value: c?.pending, icon: PauseCircle, tone: "text-slate-500", badge: "bg-[#F8FAFC] text-slate-500" },
  ];
  const empty = issues.state === "ready" && issues.items.length === 0;

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-72 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={!ctx} className="btn btn-primary h-11 px-6 text-sm"><Plus className="size-4" aria-hidden />{t("newRequest")}</button>
      </FadeIn>

      {noLease && <p role="note" className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-800">{t("noLease")}</p>}

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t("stats.aria")}>
        {metric.map((m, i) => (
          <motion.div
            key={m.key} initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.07 }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.28)] motion-reduce:hover:translate-y-0"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{m.label}</p>
              <p className={clsx("mt-1 text-4xl font-extrabold", m.tone)}>{m.value === undefined ? <span className="skeleton inline-block h-9 w-14 rounded" aria-label={t("loading")} /> : <CountUp value={m.value} format={n} />}</p>
            </div>
            <span aria-hidden className={clsx("grid size-12 place-items-center rounded-xl", m.badge)}><m.icon className="size-6" /></span>
          </motion.div>
        ))}
      </div>
      {statsQ.state === "error" && !stats && <p role="alert" className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="size-4" aria-hidden />{t("stats.error")}<button type="button" onClick={statsQ.reload} className="font-semibold underline">{t("retry")}</button></p>}

      <div role="tablist" aria-label={t("tabs.aria")} className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/70 bg-white/60 p-1.5 backdrop-blur-xl [scrollbar-width:none]">
        {TABS.map((k) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} className="relative h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
              {on && <motion.span layoutId="tm-tab" transition={{ duration: reduce ? 0 : 0.35 }} className="absolute inset-0 -z-0 rounded-xl bg-slate-100 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200" />}
              <span className="relative z-10 inline-flex items-center gap-2">{t(`tabs.${k}`)}{stats && <span className={clsx("rounded-full px-1.5 text-[0.7rem] font-bold", on ? "bg-white text-slate-600" : "text-slate-400")}>{n(tabCount(k, stats))}</span>}</span>
            </button>
          );
        })}
      </div>

      <section aria-label={t("list.aria")} aria-busy={issues.state === "loading" || undefined}>
        {issues.state === "loading" && <div className="space-y-3"><span className="sr-only">{t("loading")}</span>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>}
        {issues.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={issues.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}
        {empty && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-600">{tab === "all" ? <Wrench className="size-8" /> : <CheckCircle2 className="size-8" />}</span>
            <h2 className="text-lg font-bold text-navy">{t(tab === "all" ? "empty.allTitle" : "empty.tabTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t(tab === "all" ? "empty.allText" : "empty.tabText")}</p>
            {tab !== "all" ? <button type="button" onClick={() => setTab("all")} className="btn btn-white h-10 px-5 text-sm">{t("empty.showAll")}</button>
              : ctx && <button type="button" onClick={() => setCreating(true)} className="btn btn-primary h-10 px-5 text-sm"><Plus className="size-4" aria-hidden />{t("newRequest")}</button>}
          </FadeIn>
        )}
        {issues.items.length > 0 && (
          <>
            <ul className={clsx("space-y-3 transition-opacity duration-300", issues.fetching && issues.state === "ready" && !issues.hasMore && "opacity-80")}>
              <AnimatePresence initial={false}>
                {issues.items.map((i, k) => <RequestCard key={i.id} issue={i} index={k} onEdit={setEditing} onDelete={setToDelete} />)}
              </AnimatePresence>
              {issues.fetching && issues.state === "ready" && issues.hasMore && [0, 1].map((i) => <li key={`sk${i}`} aria-hidden className="skeleton h-32 rounded-2xl" />)}
            </ul>
            <div className="mt-6 flex flex-col items-center gap-2">
              {issues.hasMore && (
                <button type="button" onClick={issues.loadMore} disabled={issues.fetching} className="btn btn-white h-11 px-8 text-sm">
                  {issues.fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{issues.fetching ? t("list.loadingMore") : t("list.loadMore")}
                </button>
              )}
              {!issues.hasMore && <p className="text-xs text-label">{t("list.end", { n: n(issues.items.length) })}</p>}
              {issues.moreError && <p role="alert" className="text-sm font-medium text-red-600">{t("list.moreError")}</p>}
            </div>
          </>
        )}
      </section>

      {ctx && <NewRequestModal open={creating} ctx={ctx} onClose={() => setCreating(false)} onCreated={created} />}
      {ctx && <EditRequestModal issue={editing} ctx={ctx} onClose={() => setEditing(null)} onSaved={saved} />}
      <DeleteRequestModal issue={toDelete} busy={deleting} onClose={() => !deleting && setToDelete(null)} onConfirm={(i) => void confirmDelete(i)} />
    </div>
  );
}
