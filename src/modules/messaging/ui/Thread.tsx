"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AlertTriangle, ArrowLeft, ArrowUp, Loader2, MessageCircleHeart, MessagesSquare, Phone, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { PersonAvatar } from "./PersonAvatar";
import { dividerKind, groupByDay, otherOf } from "./logic";
import type { Conversation } from "./types";
import type { useThread } from "./use-thread";

interface Props { conversation: Conversation | null; thread: ReturnType<typeof useThread>; meId: string; now: number; canCall: boolean; onCall: () => void; onBack: () => void; className?: string;
  /** Super Admin: open the other person's profile card */
  onProfile?: () => void }

/** Right column: who you are talking to, the messages with date pills, and the message box. */
export function Thread({ conversation, thread, meId, now, canCall, onCall, onBack, className, onProfile }: Props) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef<string | null>(null);
  const p = conversation ? otherOf(conversation) : null;
  const groups = useMemo(() => groupByDay(thread.items), [thread.items]);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", ...opts }).format(new Date(iso));

  // stay at the bottom for new messages unless the reader scrolled up; a newly opened chat always starts at the bottom
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (lastId.current !== conversation?.id) { stick.current = true; lastId.current = conversation?.id ?? null; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [thread.items, thread.state, conversation?.id]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <section aria-label={t("thread.aria")} className={clsx("flex-col items-center justify-center gap-3 px-6 text-center", className)}>
        <span aria-hidden className="grid size-20 place-items-center rounded-3xl bg-white/70 text-[#0A84F0] shadow-[0_14px_36px_-18px_rgba(10,132,240,0.6)]"><MessagesSquare className="size-10" /></span>
        <h2 className="text-lg font-bold text-navy">{t("thread.selectTitle")}</h2>
        <p className="max-w-xs text-sm text-slate-600">{t("thread.selectText")}</p>
      </section>
    );
  }
  const name = p?.fullName ?? t("support.title");
  const status = !p ? t("support.subtitle") : p.online ? t("status.online") : p.lastSeenAt ? t("status.lastSeen", { time: fmt(p.lastSeenAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("status.offline");

  return (
    <section aria-label={t("thread.aria")} className={clsx("min-h-0 flex-col", className)}>
      <header className="flex items-center gap-3 border-b border-white/60 bg-white/70 px-3 py-3 backdrop-blur-xl sm:px-5">
        <button type="button" onClick={onBack} aria-label={t("thread.back")} className="grid size-9 shrink-0 place-items-center rounded-full text-navy hover:bg-slate-100 md:hidden"><ArrowLeft className="size-5 rtl:rotate-180" aria-hidden /></button>
        {(() => {
          const who = (
            <>
              <PersonAvatar name={name} url={p?.avatarUrl} size="size-11" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-navy">{name}</span>
                <span className={clsx("flex items-center gap-1.5 text-xs", p?.online ? "font-semibold text-emerald-600" : "text-slate-500")}>
                  {p && <span aria-hidden className={clsx("size-2 rounded-full", p.online ? "bg-emerald-500" : "bg-slate-300")} />}{status}
                </span>
              </span>
            </>
          );
          return onProfile && p
            ? <button type="button" onClick={onProfile} aria-label={t("profile.open", { name })} title={t("profile.open", { name })} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-colors duration-300 hover:bg-sky-50/70 focus-visible:outline-2 focus-visible:outline-[#48BDFA]">{who}</button>
            : <div className="flex min-w-0 flex-1 items-center gap-3">{who}</div>;
        })()}
        {canCall && p && (
          <button type="button" onClick={onCall} aria-label={t("call.start", { name })} title={t("call.start", { name })} className="grid size-11 place-items-center rounded-full text-[#0A84F0] transition-all duration-300 hover:scale-105 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[#48BDFA]"><Phone className="size-[1.35rem]" aria-hidden /></button>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 px-3 py-4 sm:px-6" aria-live="polite" aria-relevant="additions">
        {thread.state === "loading" && <div aria-busy="true" className="space-y-4"><span className="sr-only">{t("thread.loading")}</span>{[0, 1, 2, 3].map((i) => <div key={i} className={clsx("skeleton h-14 rounded-2xl", i % 2 ? "ml-auto w-2/3" : "w-1/2")} />)}</div>}
        {thread.state === "error" && (
          <div role="alert" className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-8 text-center text-red-700">
            <AlertTriangle className="size-7" aria-hidden /><p className="text-sm font-semibold">{t("thread.error")}</p>
            <button type="button" onClick={thread.reload} className="btn btn-white h-9 px-4 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}
        {thread.state === "ready" && thread.items.length === 0 && (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-2 text-center"><span aria-hidden className="grid size-14 place-items-center rounded-2xl bg-pink-100 text-pink-500"><MessageCircleHeart className="size-7" /></span><p className="font-bold text-navy">{t("thread.emptyTitle")}</p><p className="text-sm text-slate-600">{t("thread.emptyText", { name })}</p></div>
        )}
        {thread.state === "ready" && thread.items.length > 0 && (
          <>
            {thread.hasOlder && <div className="mb-3 flex justify-center"><button type="button" onClick={() => void thread.loadOlder()} disabled={thread.loadingOlder} className="btn btn-white h-9 px-4 text-xs">{thread.loadingOlder ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />}{t("thread.older")}</button></div>}
            {groups.map((g) => {
              const kind = dividerKind(g.iso, now);
              return (
                <div key={g.key} className="mb-3">
                  <p className="my-3 flex justify-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[0.68rem] font-semibold text-slate-500 shadow-sm">
                    {kind === "today" ? t("divider.today") : kind === "yesterday" ? t("divider.yesterday") : `${fmt(g.iso, { day: "2-digit", month: "short", year: "numeric" })} | ${fmt(g.iso, { hour: "2-digit", minute: "2-digit", hour12: false })}`}
                  </span></p>
                  <ul className="space-y-1.5">
                    {g.items.map((m, i) => <MessageBubble key={m.clientId || m.id} m={m} mine={m.senderId === meId} sender={p} showAvatar={g.items[i + 1]?.senderId !== m.senderId} readUpTo={thread.readUpTo} meId={meId} onRetry={thread.retry} />)}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </div>
      {thread.sendError && (
        <p role="alert" className="flex items-start justify-between gap-3 border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{t(`thread.sendError.${thread.sendError}`)}<button type="button" onClick={thread.clearSendError} className="shrink-0 font-bold underline">{t("composer.dismiss")}</button></p>
      )}
      <Composer disabled={thread.state !== "ready"} onText={(x) => void thread.sendText(x)} onVoice={(v) => void thread.sendVoice(v)} />
    </section>
  );
}
