"use client";

import { AlarmClock, Bell, Clock, DollarSign, ShieldCheck, TriangleAlert, UserCheck, Wrench, Zap, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useDescribe } from "./describe";
import { relativeTime } from "./logic";
import type { Kind, Notification } from "./types";

const LOOK: Record<Kind, { icon: LucideIcon; box: string; wide?: string }> = {
  received: { icon: DollarSign, box: "bg-green-100 text-green-600" },
  overdue: { icon: AlarmClock, box: "bg-orange-100 text-orange-600" },
  emergency: { icon: TriangleAlert, box: "bg-red-100 text-red-600" },
  solve: { icon: ShieldCheck, box: "bg-yellow-100 text-yellow-600", wide: "border-yellow-200 bg-gradient-to-r from-yellow-50/90 to-amber-50/70" },
  quick: { icon: Zap, box: "bg-pink-100 text-pink-600", wide: "border-pink-200 bg-gradient-to-r from-pink-50/90 to-fuchsia-50/70" },
  maintenance: { icon: Wrench, box: "bg-sky-100 text-sky-600" },
  tenancy: { icon: UserCheck, box: "bg-purple-100 text-purple-600" },
  generic: { icon: Bell, box: "bg-slate-100 text-slate-500" },
};

interface Props { n: Notification; index: number; now: number; busy: boolean; onView: (n: Notification) => void; onRead: (n: Notification) => void }

/** One notification: coloured icon, a headline, a message that always names tenant, unit and property, the time and two buttons. */
export function NotificationCard({ n, index, now, busy, onView, onRead }: Props) {
  const t = useTranslations("owner.notifications");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { kind, headline, body } = useDescribe()(n);
  const look = LOOK[kind];
  const unread = !n.readAt;
  const { unit, n: count } = relativeTime(n.createdAt, now);
  const full = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(n.createdAt));

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -30px 0px" }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(index % 6, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        "relative flex flex-col gap-3 rounded-2xl border p-4 pl-5 shadow-[0_8px_28px_-16px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0 xl:flex-row xl:items-center",
        look.wide ?? (unread ? "border-white/80 bg-white/75" : "border-white/50 bg-white/40"), look.wide && !unread && "opacity-80",
      )}
    >
      {unread && <span aria-hidden className="absolute inset-y-3 left-1.5 w-1 rounded-full bg-brand-gradient" />}
      <div className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden className={clsx("grid size-12 shrink-0 place-items-center rounded-xl", look.box)}><look.icon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <h3 className={clsx("flex items-center gap-2 text-[0.98rem] text-navy", unread ? "font-extrabold" : "font-semibold")}>
            <span className={clsx(look.wide && "uppercase tracking-wide")}>{headline}</span>
            {unread && <span className="size-2 shrink-0 rounded-full bg-[#F413E6] motion-safe:animate-pulse" role="img" aria-label={t("unread")} />}
          </h3>
          {body && <p className={clsx("mt-0.5 text-sm", unread ? "text-slate-700" : "text-slate-500")}>{body}</p>}
          <time dateTime={n.createdAt} title={full} className="mt-1.5 inline-flex cursor-help items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">
            <Clock className="size-3" aria-hidden />{t(`time.${unit}`, { n: count })}
          </time>
        </div>
      </div>
      <div className="flex shrink-0 gap-2.5">
        <button type="button" onClick={() => onView(n)} className="btn btn-primary h-10 px-4 text-[0.82rem]">{t(look.wide ? "viewShort" : "view")}</button>
        {unread && <button type="button" onClick={() => onRead(n)} disabled={busy} className="btn btn-white h-10 px-4 text-[0.82rem]">{t("markRead")}</button>}
      </div>
    </motion.li>
  );
}
