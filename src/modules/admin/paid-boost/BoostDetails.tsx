"use client";

import { ImageOff, Mail, Phone } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { day, taka } from "../manage-home/format";
import type { BoostRow, BoostState } from "./types";

export const STATE_STYLE: Record<BoostState, string> = { PENDING: "bg-amber-100 text-amber-700", ACTIVE: "bg-emerald-100 text-emerald-700", EXPIRED: "bg-slate-200 text-slate-600", REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-slate-200 text-slate-500" };
export const PAY_STYLE: Record<string, string> = { PENDING_REVIEW: "bg-amber-100 text-amber-700", SUCCESS: "bg-emerald-100 text-emerald-700", FAILED: "bg-red-100 text-red-700", REFUNDED: "bg-sky-100 text-sky-700", INITIATED: "bg-slate-200 text-slate-600" };

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

/** Everything about one boost, read-only: shared by the View window and the top of the Edit window. */
export function BoostDetails({ r }: { r: BoostRow }) {
  const t = useTranslations("admin.paidBoost");
  const tm = useTranslations("admin.manageHome");
  const locale = useLocale();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3">
        {r.listing.thumbnailUrl ? <img src={r.listing.thumbnailUrl} alt="" className="size-16 shrink-0 rounded-xl border border-white object-cover shadow-sm" /> : <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImageOff className="size-6" /></span>}
        <div className="min-w-0">
          <p className="break-words font-bold text-navy">{r.listing.title}</p>
          <p className="text-xs text-slate-500">{t(`details.type.${r.listing.type}`)} · {taka(locale, r.listing.price)}</p>
          {r.listing.location && <p className="break-words text-xs text-slate-500">{r.listing.location}</p>}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Item label={t("details.status")}><span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[r.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${r.state}`)}</span></Item>
        <Item label={t("details.payment")}><span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", PAY_STYLE[r.paymentStatus ?? "INITIATED"])}>{t(`payment.${r.paymentStatus ?? "INITIATED"}`)}</span></Item>
        <Item label={t("details.owner")}>
          {r.user.fullName}{r.user.ownerCode && <span className="ml-1.5 text-[0.68rem] font-bold text-[#0A84F0]">{r.user.ownerCode}</span>}
          <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{tm("phone")}: </span>{formatPhone(r.user.phone)}</span>
          <span className="flex items-center gap-1.5 break-all text-xs font-medium text-slate-500"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{tm("email")}: </span>{r.user.email ?? "—"}</span>
        </Item>
        <Item label={t("details.amount")}>{taka(locale, r.amount)} <span className="font-medium text-slate-500">· bKash</span></Item>
        <Item label={t("details.trx")}><span className="font-mono">{r.trxId}</span></Item>
        <Item label={t("details.sender")}><span dir="ltr">{formatPhone(r.senderNumber)}</span></Item>
        <Item label={t("details.requested")}>{day(locale, r.createdAt)}</Item>
        <Item label={t("details.length")}>{t("days", { count: r.durationDays })}</Item>
        <Item label={t("details.starts")}>{r.startsAt ? day(locale, r.startsAt) : "—"}</Item>
        <Item label={t("details.ends")}>{r.endsAt ? day(locale, r.endsAt) : "—"}</Item>
        {r.reviewedAt && <Item label={t("details.reviewed")}>{day(locale, r.reviewedAt)}</Item>}
        {r.rejectionReason && <Item label={t("details.reason")}><span className="text-red-600">{r.rejectionReason}</span></Item>}
      </dl>
    </div>
  );
}
