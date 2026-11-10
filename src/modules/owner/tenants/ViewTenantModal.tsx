"use client";

import { CalendarClock, Mail, MessageSquare, Pencil, Phone, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber, formatTaka } from "../dashboard/format";
import { Avatar } from "../units/TenantPicker";
import { daysUntil, formatDate, formatPhone } from "./format";
import { statusTone } from "./schema";
import type { DirectoryRow, RentRecordRow } from "./types";

interface Props { row: DirectoryRow | null; onClose: () => void; onMessage: (r: DirectoryRow) => void; onEdit: (r: DirectoryRow) => void }

const RENT_TONE = { PAID: "success", PARTIAL: "warning", DUE: "warning", OVERDUE: "pink" } as const;

export function ViewTenantModal({ row, onClose, onMessage, onEdit }: Props) {
  return (
    <Modal open={row !== null} onClose={onClose} labelledBy="view-tenant-title" maxWidth="max-w-[620px]">
      {row && <Details row={row} onClose={onClose} onMessage={onMessage} onEdit={onEdit} />}
    </Modal>
  );
}

function Details({ row, onClose, onMessage, onEdit }: { row: DirectoryRow; onClose: () => void; onMessage: Props["onMessage"]; onEdit: Props["onEdit"] }) {
  const t = useTranslations("owner.tenants.view");
  const s = useTranslations("owner.tenants.status");
  const locale = useLocale();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const rent = useAuthQuery<RentRecordRow[]>(`/rent/records?agreementId=${row.id}`);
  const left = daysUntil(row.endDate);
  const fact = (label: string, value: string) => (
    <div className="rounded-lg bg-slate-50/80 px-3 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-label">{label}</dt><dd className="mt-0.5 text-sm font-bold text-navy">{value}</dd></div>
  );
  const months = (rent.data ?? []).slice(0, 6);
  const paidTotal = (rent.data ?? []).reduce((sum, r) => sum + Number(r.paid), 0);

  return (
    <div>
      <header className="flex items-center gap-4 pr-10">
        <Avatar name={row.tenant?.fullName ?? "?"} url={row.tenant?.avatarUrl} size="size-14" />
        <div className="min-w-0">
          <h2 id="view-tenant-title" className="truncate text-xl font-bold text-navy sm:text-2xl">{row.tenant?.fullName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2"><StatusBadge tone={statusTone[row.status]} dot>{s(row.status)}</StatusBadge><span className="flex items-center gap-1 text-xs text-slate-600"><Users className="size-3.5" aria-hidden />{t("members", { n: n(row.members) })}</span></div>
        </div>
      </header>

      <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <p className="flex items-center gap-2 rounded-lg bg-slate-50/80 px-3 py-2"><Mail className="size-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate">{row.tenant?.email ?? "—"}</span></p>
        <p className="flex items-center gap-2 rounded-lg bg-slate-50/80 px-3 py-2"><Phone className="size-4 shrink-0 text-slate-400" aria-hidden />{formatPhone(row.tenant?.phone)}</p>
      </div>

      <h3 className="mt-5 text-sm font-bold text-navy">{t("lease")}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fact(t("property"), row.property.name)}
        {fact(t("unit"), row.unit.unitNumber)}
        {fact(t("rent"), taka(Number(row.rent)))}
        {fact(t("entry"), formatDate(locale, row.startDate))}
        {fact(t("leaseEnd"), formatDate(locale, row.endDate))}
        {fact(t("deposit"), taka(Number(row.deposit)))}
      </dl>
      {left !== null && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-600"><CalendarClock className="size-3.5" aria-hidden />{left < 0 ? t("expired", { days: n(Math.abs(left)) }) : t("daysLeft", { days: n(left) })}</p>}
      {row.noticeGivenAt && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{t("noticeOn", { date: formatDate(locale, row.noticeGivenAt) })}</p>}

      <h3 className="mt-5 flex items-baseline justify-between text-sm font-bold text-navy">{t("rentHistory")}{rent.state === "ready" && <span className="text-xs font-medium text-label">{t("paidTotal", { amount: taka(paidTotal) })}</span>}</h3>
      <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/70">
        {rent.state === "loading" && <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-8 w-full" />)}</div>}
        {rent.state === "error" && <p role="alert" className="p-4 text-center text-sm text-red-600">{t("rentError")} <button type="button" onClick={rent.reload} className="font-bold underline underline-offset-2">{t("retry")}</button></p>}
        {rent.state === "ready" && months.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{t("rentEmpty")}</p>}
        {rent.state === "ready" && months.length > 0 && (
          <ul className="divide-y divide-slate-200/70">
            {months.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-navy">{new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(r.billingMonth))}</span>
                <span className="flex items-center gap-3"><span className="tabular-nums text-slate-600">{taka(Number(r.paid))} / {taka(Number(r.total))}</span><StatusBadge tone={RENT_TONE[r.status]}>{t(`rentStatus.${r.status}`)}</StatusBadge></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-right text-xs"><Link href={"/owner/rent" as never} className="font-semibold text-[#0A84F0] underline underline-offset-2">{t("openRent")}</Link></p>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onClose} className="btn btn-white h-11 sm:min-w-28">{t("close")}</button>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => { onClose(); onMessage(row); }} className="btn btn-glass h-11 gap-2"><MessageSquare className="size-4" aria-hidden />{t("message")}</button>
          <button type="button" onClick={() => { onClose(); onEdit(row); }} className="btn btn-primary h-11 gap-2"><Pencil className="size-4" aria-hidden />{t("edit")}</button>
        </div>
      </div>
    </div>
  );
}
