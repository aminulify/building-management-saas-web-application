"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, CheckCircle2, Clock, Loader2, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import { DeleteIssueModal } from "./DeleteIssueModal";
import { IssueCard } from "./IssueCard";
import { adjustStats, inTab, tabCount } from "./logic";
import { useIssues } from "./use-issues";
import type { Issue, PickStatus, Stats, Tab } from "./types";

const TABS: Tab[] = ["all", "pending", "progress", "completed"];

export function MaintenanceView() {
  const t = useTranslations("owner.maintenance");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const n = formatNumber(locale);

  const [tab, setTab] = useState<Tab>("all");
  const issues = useIssues(tab);
  const statsQ = useAuthQuery<Stats>("/maintenance/stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Issue | null>(null);
  const [deleting, setDeleting] = useState(false);

  // the cards show the server's numbers, and move at once when a status changes; the next load replaces them
  useEffect(() => { if (statsQ.data) setStats(statsQ.data); }, [statsQ.data]);

  async function changeStatus(issue: Issue, to: PickStatus) {
    const before = issue.status;
    setBusyId(issue.id);
    issues.patch(issue.id, { status: to });
    if (stats) setStats(adjustStats(stats, issue, to));
    try {
      await authApi(`/maintenance/${issue.id}/status`, { method: "POST", body: { status: to } });
      toast("success", t("toast.status", { status: t(`status.${to}`) }));
      if (!inTab(tab, to)) setTimeout(() => issues.remove(issue.id), reduce ? 0 : 450); // leaves the tab it no longer belongs to
      statsQ.reload();
    } catch {
      issues.patch(issue.id, { status: before });
      if (stats) setStats(stats);
      toast("error", t("toast.error"));
    } finally { setBusyId(null); }
  }

  async function confirmDelete(issue: Issue) {
    setDeleting(true);
    try {
      await authApi(`/maintenance/${issue.id}`, { method: "DELETE" });
      issues.remove(issue.id);
      if (stats) setStats(adjustStats(stats, issue, null));
      statsQ.reload();
      setToDelete(null);
      toast("success", t("toast.deleted"));
    } catch { toast("error", t("toast.error")); } finally { setDeleting(false); }
  }

  const cards = [
    { key: "open", label: t("stats.open"), value: stats?.open, icon: TriangleAlert, tone: "text-purple-600", badge: "bg-[#F3E8FF] text-purple-600" },
    { key: "progress", label: t("stats.inProgress"), value: stats?.inProgress, icon: Clock, tone: "text-yellow-600", badge: "bg-[#FEF9C3] text-yellow-600" },
    { key: "critical", label: t("stats.critical"), value: stats?.critical, icon: AlertTriangle, tone: "text-red-600", badge: "bg-[#FEE2E2] text-red-600" },
  ];
  const empty = issues.state === "ready" && issues.items.length === 0;

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-72 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header">
        <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t("stats.aria")}>
        {cards.map((c, i) => (
          <motion.div
            key={c.key} initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.07 }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.28)] motion-reduce:hover:translate-y-0"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{c.label}</p>
              <p className={clsx("mt-1 text-4xl font-extrabold", c.tone)}>{c.value === undefined ? <span className="skeleton inline-block h-9 w-14 rounded" aria-label={t("loading")} /> : <CountUp value={c.value} format={n} />}</p>
            </div>
            <span aria-hidden className={clsx("grid size-12 place-items-center rounded-xl", c.badge)}><c.icon className="size-6" /></span>
          </motion.div>
        ))}
      </div>
      {statsQ.state === "error" && !stats && <p role="alert" className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="size-4" aria-hidden />{t("stats.error")}<button type="button" onClick={statsQ.reload} className="font-semibold underline">{t("retry")}</button></p>}

      <div role="tablist" aria-label={t("tabs.aria")} className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/70 bg-white/60 p-1.5 backdrop-blur-xl [scrollbar-width:none]">
        {TABS.map((k) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} className="relative h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
              {on && <motion.span layoutId="mt-tab" transition={{ duration: reduce ? 0 : 0.35 }} className="absolute inset-0 -z-0 rounded-xl bg-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200" />}
              <span className="relative z-10 inline-flex items-center gap-2">{t(`tabs.${k}`)}{stats && <span className={clsx("rounded-full px-1.5 text-[0.7rem] font-bold", on ? "bg-slate-100 text-slate-600" : "text-slate-400")}>{n(tabCount(k, stats))}</span>}</span>
            </button>
          );
        })}
      </div>

      <section aria-label={t("list.aria")} aria-busy={issues.state === "loading" || undefined}>
        {issues.state === "loading" && <div className="space-y-3"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>}
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
            {tab !== "all" && <button type="button" onClick={() => setTab("all")} className="btn btn-white h-10 px-5 text-sm">{t("empty.showAll")}</button>}
          </FadeIn>
        )}
        {issues.items.length > 0 && (
          <>
            <ul className={clsx("space-y-3 transition-opacity duration-300", issues.fetching && issues.state === "ready" && "opacity-80")}>
              <AnimatePresence initial={false}>
                {issues.items.map((i, k) => <IssueCard key={i.id} issue={i} index={k} busy={busyId === i.id} onStatus={changeStatus} onDelete={setToDelete} />)}
              </AnimatePresence>
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

      <DeleteIssueModal issue={toDelete} busy={deleting} onClose={() => !deleting && setToDelete(null)} onConfirm={(i) => void confirmDelete(i)} />
    </div>
  );
}
