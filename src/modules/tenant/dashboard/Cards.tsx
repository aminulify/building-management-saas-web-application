"use client";

import { CalendarCheck, Clock, Home, Loader2, MessageCircle, Phone, Send } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatTaka } from "../../owner/dashboard/format";
import { formatDate } from "../../owner/tenants/format";
import { Avatar } from "../../owner/units/TenantPicker";
import { Reveal } from "../../owner/profile/Cards";
import { payButton, phoneHref } from "./logic";
import type { TenantDashboard } from "./types";

type Tenancy = NonNullable<TenantDashboard["tenancy"]>;
type Next = NonNullable<TenantDashboard["nextPayment"]>;

/** "December 2026" / "ডিসেম্বর ২০২৬" from "2026-12". */
export const monthLabel = (locale: string, ym: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export function LeaseCard({ tenancy }: { tenancy: Tenancy }) {
  const t = useTranslations("tenant.dashboard.lease");
  const locale = useLocale();
  return (
    <Reveal label={t("title")} className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="grid size-12 place-items-center rounded-xl bg-sky-100 text-sky-600"><Home className="size-6" /></span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-100/90 px-2.5 py-0.5 text-xs font-semibold text-green-700"><i aria-hidden className="size-1.5 rounded-full bg-current" />{t("active")}</span>
      </div>
      <p className="mt-4 text-xl font-bold text-navy">{tenancy.property.name}</p>
      <p className="text-sm text-slate-600">{t("unit", { no: tenancy.unit.unitNumber })} <span aria-hidden>•</span> {t("home")}</p>
      <dl className="mt-4 space-y-2 border-t border-slate-200/70 pt-4 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("started")}</dt><dd className="font-semibold text-navy">{formatDate(locale, tenancy.startDate)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("ends")}</dt><dd className="font-semibold text-navy">{tenancy.endDate ? formatDate(locale, tenancy.endDate) : t("present")}</dd></div>
      </dl>
    </Reveal>
  );
}

export function PaymentCard({ next, onSend }: { next: Next; onSend: () => void }) {
  const t = useTranslations("tenant.dashboard.payment");
  const locale = useLocale();
  const taka = formatTaka(locale);
  const mode = payButton(next);
  const late = next.state === "OVERDUE";
  return (
    <Reveal label={t("title")} delay={0.05} className="relative flex flex-col overflow-hidden border-transparent bg-brand-gradient text-white shadow-[0_18px_44px_-20px_rgba(244,19,230,0.55)]">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white/90">{t("title")}</p>
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-white/20 text-xl font-bold backdrop-blur">৳</span>
      </div>
      <p className="relative mt-3 text-[2rem] font-extrabold leading-tight sm:text-[2.2rem]"><CountUp value={Number(next.amount)} format={taka} /></p>
      <p className="relative text-sm text-white/90">{t("dueDate", { date: formatDate(locale, next.dueDate) })}{late && <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide">{t("late")}</span>}</p>
      <p className="relative mt-1 text-xs text-white/80">{monthLabel(locale, next.month)}</p>
      <div className="relative mt-4 border-t border-white/30 pt-3 text-sm text-white/90">{next.lastPaidAt ? t("lastPaid", { date: formatDate(locale, next.lastPaidAt) }) : t("noPayments")}</div>
      <button type="button" onClick={onSend} disabled={mode !== "send"} aria-busy={mode === "pending" || undefined}
        className="btn btn-white relative mt-4 h-11 w-full text-sm font-bold !text-[#7B2FF7] disabled:!opacity-100 disabled:!text-slate-500">
        {mode === "pending" ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("pending")}</> : mode === "notBilled" ? <><CalendarCheck className="size-4" aria-hidden />{t("notBilled")}</> : <><Send className="size-4" aria-hidden />{t("send")}</>}
      </button>
      {mode === "pending" && next.pending && <p className="relative mt-2 flex items-center gap-1.5 text-xs text-white/90"><Clock className="size-3.5" aria-hidden />{t("pendingNote", { amount: taka(Number(next.pending.amount)), method: t(`methods.${next.pending.method}` as never) })}</p>}
    </Reveal>
  );
}

export function HelpDeskCard({ owner, onChat, chatting }: { owner: NonNullable<Tenancy["owner"]>; onChat: () => void; chatting: boolean }) {
  const t = useTranslations("tenant.dashboard.help");
  const href = phoneHref(owner.phone);
  return (
    <Reveal label={t("title")} delay={0.1} className="flex flex-col">
      <span className="inline-flex w-fit rounded-full border border-sky-200 bg-sky-50 px-3 py-0.5 text-xs font-bold text-[#0A84F0]">{t("title")}</span>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={owner.fullName} url={owner.avatarUrl} size="size-14" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-navy">{owner.fullName}</p>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">{t("owner")} / {t("id")}: {owner.ownerCode ?? "—"}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {href ? <a href={href} className="btn btn-white h-11 gap-2 text-sm"><Phone className="size-4" aria-hidden />{t("call")}</a>
          : <button type="button" disabled title={t("noPhone")} className="btn btn-white h-11 gap-2 text-sm"><Phone className="size-4" aria-hidden />{t("call")}</button>}
        <button type="button" onClick={onChat} disabled={chatting} aria-busy={chatting || undefined} className={clsx("btn btn-primary h-11 gap-2 text-sm")}>
          {chatting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}{t("chat")}
        </button>
      </div>
    </Reveal>
  );
}
