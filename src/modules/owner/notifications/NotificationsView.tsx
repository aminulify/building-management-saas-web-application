"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, BellOff, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { formatNumber } from "../dashboard/format";
import { useOwner } from "../shell/OwnerContext";
import { NotificationCard } from "./NotificationCard";
import { StoryModal } from "./StoryModal";
import { tabBadge } from "./logic";
import { useNotifications } from "./use-notifications";
import type { Notification, Tab } from "./types";

const TABS: Tab[] = ["all", "payment", "maintenance"];

export function NotificationsView() {
  const t = useTranslations("owner.notifications");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const { setUnread } = useOwner();
  const n = formatNumber(locale);

  const [tab, setTab] = useState<Tab>("all");
  const feed = useNotifications(tab, setUnread);
  const [story, setStory] = useState<Notification | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // "12 mins ago" stays true: the times are worked out again every minute
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  async function read(item: Notification) {
    setBusyId(item.id);
    const ok = await feed.markRead(item);
    if (!ok) toast("error", t("toast.error"));
    setBusyId(null);
  }
  async function readAll() {
    if (!(await feed.markAll())) toast("error", t("toast.error")); else toast("success", t("toast.allRead"));
  }

  const unread = feed.counts.unread;
  const empty = feed.state === "ready" && feed.items.length === 0;

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-72 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <AnimatePresence initial={false}>
            {unread > 0 && (
              <motion.span key="badge" initial={{ opacity: 0, scale: reduce ? 1 : 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.8 }} transition={{ duration: 0.3 }}
                role="status" className="rounded-full bg-[#0A84F0] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white shadow-[0_6px_16px_-6px_rgba(10,132,240,0.7)]">
                {t("newBadge", { n: n(unread) })}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {unread > 0 && <button type="button" onClick={() => void readAll()} className="btn btn-white h-10 px-4 text-sm"><CheckCheck className="size-4" aria-hidden />{t("markAll")}</button>}
      </FadeIn>

      <div role="tablist" aria-label={t("tabs.aria")} className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/70 bg-white/60 p-1.5 backdrop-blur-xl [scrollbar-width:none]">
        {TABS.map((k) => {
          const on = tab === k;
          const badge = tabBadge(k, feed.counts);
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} className="relative h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
              {on && <motion.span layoutId="nc-tab" transition={{ duration: reduce ? 0 : 0.35 }} className="absolute inset-0 rounded-xl bg-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200" />}
              <span className="relative z-10 inline-flex items-center gap-2">{t(`tabs.${k}`)}{badge > 0 && <span className="rounded-full bg-[#F413E6] px-1.5 text-[0.68rem] font-bold text-white">{n(badge)}</span>}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {feed.fresh > 0 && (
          <motion.button key="fresh" type="button" onClick={feed.clearFresh} initial={{ opacity: 0, y: reduce ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="mx-auto flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-bold text-white shadow-lg" aria-live="polite">
            {t("fresh", { n: feed.fresh })}
          </motion.button>
        )}
      </AnimatePresence>

      <section aria-label={t("list.aria")} aria-busy={feed.state === "loading" || undefined}>
        {feed.state === "loading" && <div className="space-y-3"><span className="sr-only">{t("loading")}</span>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>}
        {feed.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={feed.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}
        {empty && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><BellOff className="size-8" /></span>
            <h2 className="text-lg font-bold text-navy">{t(tab === "all" ? "empty.allTitle" : "empty.tabTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{t(tab === "all" ? "empty.allText" : "empty.tabText")}</p>
            {tab !== "all" && <button type="button" onClick={() => setTab("all")} className="btn btn-white h-10 px-5 text-sm">{t("empty.showAll")}</button>}
          </FadeIn>
        )}
        {feed.items.length > 0 && (
          <>
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {feed.items.map((item, i) => <NotificationCard key={item.id} n={item} index={i} now={now} busy={busyId === item.id} onView={setStory} onRead={(x) => void read(x)} />)}
              </AnimatePresence>
              {feed.fetching && feed.state === "ready" && [0, 1, 2].map((i) => <li key={`sk${i}`} aria-hidden className="skeleton h-24 rounded-2xl" />)}
            </ul>
            <div className="mt-6 flex flex-col items-center gap-2">
              {feed.hasMore && (
                <button type="button" onClick={feed.loadMore} disabled={feed.fetching} className="btn btn-white h-11 px-8 text-sm">
                  {feed.fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{feed.fetching ? t("list.loadingMore") : t("list.loadMore")}
                </button>
              )}
              {!feed.hasMore && <p className="text-xs text-label">{t("list.end", { n: n(feed.items.length) })}</p>}
              {feed.moreError && <p role="alert" className="text-sm font-medium text-red-600">{t("list.moreError")}</p>}
            </div>
          </>
        )}
      </section>

      <StoryModal n={story} onClose={() => setStory(null)} onRead={(x) => { void feed.markRead(x); }} />
      <span className={clsx("sr-only")} aria-live="polite">{unread > 0 ? t("newBadge", { n: n(unread) }) : ""}</span>
    </div>
  );
}
