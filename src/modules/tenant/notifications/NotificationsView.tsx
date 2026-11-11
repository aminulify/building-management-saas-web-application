"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, BellOff, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { PayModal } from "../dashboard/PayModal";
import { useTenant } from "../shell/TenantContext";
import { FeedCard } from "./FeedCard";
import { SummaryCards } from "./SummaryCards";
import { TrackModal } from "./TrackModal";
import { TABS, markRead, patchLive, str } from "./logic";
import { useFeed } from "./use-feed";
import type { FeedItem, Summary, Tab } from "./types";

export function NotificationsView() {
  const t = useTranslations("tenant.notifications");
  const reduce = useReducedMotion();
  const toast = useToast();
  const { refreshUnread, setUnread: setBadge } = useTenant();
  const [tab, setTab] = useState<Tab>("all");
  const feed = useFeed(tab);
  const sum = useAuthQuery<Summary>("/tenant/notifications/summary");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pay, setPay] = useState<FeedItem | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const s = sum.data ?? undefined;

  // the times ("5 mins ago") stay true, and what the landlord or government did shows up: look again every 30 s and when the tab comes back
  const busy = useRef(false);
  busy.current = feed.fetching || sum.fetching;
  const { refresh } = feed;
  const { reload: reloadSum } = sum;
  useEffect(() => {
    const tick = () => { if (!document.hidden && !busy.current) { setNow(Date.now()); refresh(); reloadSum(); refreshUnread(); } };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [refresh, reloadSum, refreshUnread]);

  const changed = () => { reloadSum(); refreshUnread(); };

  async function read(n: FeedItem) {
    setBusyId(n.id);
    feed.setItems((cur) => markRead(cur, n.id));
    try { await authApi(`/notifications/${n.id}/read`, { method: "POST" }); feed.setUnread((u) => Math.max(0, u - 1)); refreshUnread(); }
    catch { feed.reload(); toast("error", t("toast.error")); } finally { setBusyId(null); }
  }

  async function readAll() {
    setBusyId("all");
    try {
      await authApi("/notifications/read-all", { method: "POST" });
      const at = new Date().toISOString();
      feed.setItems((cur) => cur.map((n) => (n.readAt ? n : { ...n, readAt: at })));
      feed.setUnread(0); setBadge(0);
      toast("success", t("toast.allRead"));
    } catch { toast("error", t("toast.error")); } finally { setBusyId(null); }
  }

  const alertId = (n: FeedItem) => (n.live?.kind === "alert" ? n.live.id : str(n.params.alertId));

  async function accept(n: FeedItem) {
    setBusyId(n.id);
    try {
      await authApi(`/sos/${alertId(n)}/accept`, { method: "POST" });
      feed.setItems((cur) => patchLive(cur, (x) => x.id === n.id, (l) => (l.kind === "alert" ? { ...l, accepted: true } : l)));
      toast("success", t("toast.accepted"));
      changed();
    } catch { toast("error", t("toast.error")); } finally { setBusyId(null); }
  }

  async function unsolved(n: FeedItem) {
    setBusyId(n.id);
    try {
      await authApi(`/sos/${alertId(n)}/unsolved`, { method: "POST" });
      feed.setItems((cur) => patchLive(cur, (x) => x.id === n.id, (l) => (l.kind === "alert" ? { ...l, status: "PROCESSING", accepted: false } : l)));
      toast("success", t("toast.unsolved"));
      changed();
    } catch { toast("error", t("toast.error")); } finally { setBusyId(null); }
  }

  // "Send Pay Request": the bill on the card, or (for a general reminder) the oldest unpaid bill
  const target = (n: FeedItem) => {
    const np = s?.nextPayment;
    if (n.live?.kind === "rent") return { recordId: n.live.recordId, month: n.live.month, amount: n.live.owed };
    return np?.recordId ? { recordId: np.recordId, month: np.month, amount: np.amount } : null;
  };
  const payTarget = (() => {
    const x = pay ? target(pay) : null;
    return x ? { ...x, dueDate: "", state: "DUE" as const, lastPaidAt: null, lastPaidAmount: null, pending: null, payTo: s?.payTo ?? null } : null;
  })();

  const empty = feed.state === "ready" && feed.items.length === 0;

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-72 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        {feed.unread > 0 && <button type="button" onClick={() => void readAll()} disabled={busyId === "all"} className="btn btn-white h-10 px-4 text-sm">{busyId === "all" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}{t("markAll", { n: feed.unread })}</button>}
      </FadeIn>

      <SummaryCards s={s} />
      {sum.state === "error" && !s && <p role="alert" className="flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="size-4" aria-hidden />{t("summary.error")}<button type="button" onClick={sum.reload} className="font-semibold underline">{t("retry")}</button></p>}

      <div role="tablist" aria-label={t("tabs.aria")} className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/70 bg-white/60 p-1.5 backdrop-blur-xl [scrollbar-width:none]">
        {TABS.map((k) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)} className="relative h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
              {on && <motion.span layoutId="tn-tab" transition={{ duration: reduce ? 0 : 0.35 }} className="absolute inset-0 -z-0 rounded-xl bg-slate-100 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200" />}
              <span className="relative z-10">{t(`tabs.${k}`)}</span>
            </button>
          );
        })}
      </div>

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
                {feed.items.map((n, i) => (
                  <FeedCard key={n.id} n={n} index={i} now={now} busy={busyId === n.id}
                    onPay={setPay} onTrack={(x) => setTrack(x.live?.kind === "request" ? x.live.id : str(x.params.requestId))} onAccept={(x) => void accept(x)} onUnsolved={(x) => void unsolved(x)} onRead={(x) => void read(x)} />
                ))}
              </AnimatePresence>
              {feed.fetching && feed.state === "ready" && feed.hasMore && [0, 1, 2].map((i) => <li key={`sk${i}`} aria-hidden className="skeleton h-24 rounded-2xl" />)}
            </ul>
            <div className="mt-6 flex flex-col items-center gap-2">
              {feed.hasMore && (
                <button type="button" onClick={feed.loadMore} disabled={feed.fetching} className="btn btn-white h-11 px-8 text-sm">
                  {feed.fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{feed.fetching ? t("list.loadingMore") : t("list.loadMore")}
                </button>
              )}
              {!feed.hasMore && <p className={clsx("text-xs text-label")}>{t("list.end")}</p>}
              {feed.moreError && <p role="alert" className="text-sm font-medium text-red-600">{t("list.moreError")}</p>}
            </div>
          </>
        )}
      </section>

      <PayModal open={!!payTarget} next={payTarget} ownerName={s?.owner?.fullName ?? ""} onClose={() => setPay(null)} onSent={() => { feed.refresh(); changed(); }} />
      <TrackModal requestId={track} onClose={() => setTrack(null)} />
    </div>
  );
}
