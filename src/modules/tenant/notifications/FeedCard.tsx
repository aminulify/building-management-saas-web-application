"use client";

import { AlarmClock, Bell, Check, Clock, DollarSign, Hourglass, Loader2, Siren, UserCheck, Wrench, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatTaka } from "../../owner/dashboard/format";
import { relativeTime } from "../../owner/notifications/logic";
import { lookOf, monthLabels, str } from "./logic";
import type { FeedItem, Tone } from "./types";

const TONE: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  red: { box: "border-red-300 bg-red-50/70", icon: "bg-red-100 text-red-600", Icon: AlarmClock },
  green: { box: "border-green-300 bg-green-50/60", icon: "bg-green-100 text-green-600", Icon: DollarSign },
  yellow: { box: "border-yellow-300 bg-yellow-50/70", icon: "bg-yellow-100 text-yellow-600", Icon: Wrench },
  pink: { box: "border-pink-300 bg-gradient-to-r from-pink-50/90 to-fuchsia-50/70", icon: "bg-pink-100 text-pink-600", Icon: Zap },
  orange: { box: "border-orange-300 bg-orange-50/60", icon: "bg-orange-100 text-orange-600", Icon: Siren },
  purple: { box: "border-purple-300 bg-purple-50/60", icon: "bg-purple-100 text-purple-600", Icon: UserCheck },
  slate: { box: "border-white/70 bg-white/65", icon: "bg-slate-100 text-slate-500", Icon: Bell },
};
const BADGE: Record<string, string> = {
  PAID: "bg-slate-200 text-slate-600", PENDING_REQUEST: "bg-yellow-100 text-yellow-700", PENDING: "bg-amber-100 text-amber-700",
  PROCESSING: "bg-purple-100 text-purple-700", COMPLETED: "bg-green-100 text-green-700", CLOSED: "bg-slate-200 text-slate-600",
};
const btn = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[0.82rem] font-bold transition-all duration-300 disabled:opacity-60";

interface Props {
  n: FeedItem; index: number; now: number; busy: boolean;
  onPay: (n: FeedItem) => void; onTrack: (n: FeedItem) => void; onAccept: (n: FeedItem) => void; onUnsolved: (n: FeedItem) => void; onRead: (n: FeedItem) => void;
}

/** One notification: coloured box by kind, a label + title, the message, the time, and the buttons that fit its live state. */
export function FeedCard({ n, index, now, busy, onPay, onTrack, onAccept, onUnsolved, onRead }: Props) {
  const t = useTranslations("tenant.notifications");
  const root = useTranslations();
  const sos = useTranslations("owner.notifications.sosTypes");
  const time = useTranslations("owner.notifications");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const look = lookOf(n);
  const tone = TONE[look.tone];
  const taka = formatTaka(locale);
  const p = n.params;
  const unread = !n.readAt;
  const { unit, n: count } = relativeTime(n.createdAt, now);
  const full = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(n.createdAt));

  const key = `card.title.${n.type}`;
  let title = t.has(key as never) ? t(key as never) : t("card.title.update");
  let body = "";
  try {
    if (n.type === "rent.invoice") body = t("card.invoice", { month: monthLabels(locale, str(p.month)), total: taka(Number(str(p.total) || 0)) });
    else if (n.type === "rent.late") body = t("card.late", { due: taka(Number(str(p.due) || 0)) });
    else if (n.type === "rent.reminder") body = t("card.reminder", { due: taka(Number(str(p.due) || 0)), month: monthLabels(locale, str(p.month)) });
    else if (n.type === "sos.sent") {
      const alertType = n.live?.kind === "alert" ? n.live.type : str(p.alertType);
      title = alertType ? sos(alertType as never) : title;
      body = look.actions.includes("accept") ? t("card.sosSolved") : look.badge === "COMPLETED" ? t("card.sosDone") : look.badge === "PROCESSING" ? t("card.sosProcessing") : look.badge === "CLOSED" ? t("card.sosClosed") : t("card.sosPending");
    } else body = root(n.titleKey as never, p as never);
  } catch { body = ""; }

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -30px 0px" }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(index % 6, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "relative flex flex-col gap-3 rounded-2xl border p-4 pl-5 shadow-[0_8px_28px_-16px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0 lg:flex-row lg:items-center",
        tone.box, look.dim && "opacity-80",
      )}
    >
      {unread && <span aria-hidden className="absolute inset-y-3 left-1.5 w-1 rounded-full bg-brand-gradient" />}
      <div className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden className={clsx("grid size-12 shrink-0 place-items-center rounded-xl", tone.icon)}><tone.Icon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <h3 className={clsx("flex flex-wrap items-center gap-x-2 text-[0.95rem] text-navy", unread ? "font-extrabold" : "font-semibold")}>
            <span className="uppercase tracking-wide">{t(`tag.${look.tag}` as never)}</span><span aria-hidden className="text-slate-400">-</span><span>{title}</span>
            {unread && <span className="size-2 shrink-0 rounded-full bg-[#F413E6] motion-safe:animate-pulse" role="img" aria-label={t("unread")} />}
          </h3>
          {body && <p className={clsx("mt-0.5 text-sm", unread ? "text-slate-700" : "text-slate-500")}>{body}</p>}
          <time dateTime={n.createdAt} title={full} className="mt-1.5 inline-flex cursor-help items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">
            <Clock className="size-3" aria-hidden />{time(`time.${unit}` as never, { n: count } as never)}
          </time>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        {look.badge && <span className={clsx("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.72rem] font-extrabold uppercase tracking-wide", BADGE[look.badge])}>{look.badge === "PENDING_REQUEST" && <Hourglass className="size-3.5" aria-hidden />}{look.badge === "COMPLETED" && <Check className="size-3.5" aria-hidden />}{t(`badge.${look.badge}`)}</span>}
        {look.actions.includes("pay") && <button type="button" onClick={() => onPay(n)} disabled={busy} className={clsx(btn, "bg-green-600 text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.7)] hover:bg-green-700")}>{t("action.pay")}</button>}
        {look.actions.includes("track") && <button type="button" onClick={() => onTrack(n)} disabled={busy} className={clsx(btn, "bg-yellow-400 text-navy shadow-[0_6px_14px_-6px_rgba(234,179,8,0.7)] hover:bg-yellow-500")}>{t("action.track")}</button>}
        {look.actions.includes("accept") && <button type="button" onClick={() => onAccept(n)} disabled={busy} className={clsx(btn, "bg-green-600 uppercase text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.7)] hover:bg-green-700")}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{t("action.accept")}</button>}
        {look.actions.includes("unsolved") && <button type="button" onClick={() => onUnsolved(n)} disabled={busy} className={clsx(btn, "bg-slate-200 uppercase text-slate-700 hover:bg-slate-300")}>{t("action.unsolved")}</button>}
        {look.actions.includes("read") && <button type="button" onClick={() => onRead(n)} disabled={busy} className={clsx(btn, "border border-slate-200 bg-white/80 text-slate-600 hover:bg-white")}>{t("action.read")}</button>}
      </div>
    </motion.li>
  );
}
