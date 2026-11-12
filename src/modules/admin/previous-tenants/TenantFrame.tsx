"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, History, Mail, MessageCircle, Phone, ReceiptText, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import { RentBadge } from "./TenantsTable";
import type { ArchiveDetails, ArchiveRow } from "./types";

export interface Person { id: string; fullName: string; avatarUrl: string | null }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}
const LEDGER_STYLE = { PAID: "bg-emerald-100 text-emerald-700", PARTIAL: "bg-amber-100 text-amber-700", DUE: "bg-orange-100 text-orange-700", OVERDUE: "bg-red-100 text-red-700" } as const;

function Body({ d, onMessage }: { d: ArchiveDetails; onMessage: (p: Person) => void }) {
  const t = useTranslations("admin.previousTenants.details");
  const tr = useTranslations("admin.previousTenants.reason");
  const tt = useTranslations("admin.previousTenants.table");
  const trs = useTranslations("admin.previousTenants.rent");
  const locale = useLocale();
  const money = formatTaka(locale);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const stay = Math.max(0, (new Date(d.moveOutAt).getTime() - new Date(d.startDate).getTime()) / 86_400_000);
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  const tn = d.tenant;
  const owes = Number(d.unpaid) > 0;
  return (
    <div className="space-y-4">
      {tn && (
        <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
          <Avatar name={tn.fullName} url={tn.avatarUrl} size="size-16" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-navy">{tn.fullName}</h3>
            <p className="text-xs font-semibold text-[#0A84F0]">{tn.tenantCode ? tt("tenantId", { code: tn.tenantCode }) : `@${tn.username}`}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RentBadge state={d.rentStatus} />
              <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[tn.verification])}><ShieldCheck className="size-3.5" aria-hidden />{t(`nid.${tn.verification}`)}</span>
            </div>
          </div>
          <button type="button" onClick={() => onMessage({ id: tn.id, fullName: tn.fullName, avatarUrl: tn.avatarUrl })} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("messageTenant")}</button>
        </div>
      )}

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={tt("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(tn?.phone)}</span></span></Fact>
        <Fact label={tt("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{tn?.email ?? t("none")}</span></Fact>
        <Fact label={t("occupation")}>{tn?.occupation ?? t("none")}</Fact>
        <Fact label={t("nidNumber")}><span dir="ltr" className="font-mono">{tn?.nid ?? t("none")}</span></Fact>
        <Fact label={t("moveIn")}>{day(locale, d.startDate)}</Fact>
        <Fact label={t("moveOut")}>{day(locale, d.moveOutAt)}</Fact>
        <Fact label={t("stay")}>{t("stayValue", { years: num(Math.round((stay / 365.25) * 10) / 10), days: num(Math.round(stay)) })}</Fact>
        <Fact label={t("members")}>{num(d.members)}</Fact>
      </dl>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 border-amber-200/80 bg-amber-50/40 sm:grid-cols-2")}>
        <Fact label={t("reason")}>{tr(d.reasonCode)}</Fact>
        <Fact label={t("clearance")}><RentBadge state={d.rentStatus} /> {d.overridden && <span className="ml-1 text-[0.68rem] font-semibold text-slate-500">{t("ruled")}</span>}</Fact>
        <Fact label={t("unpaid")}><span className={owes ? "text-red-600" : "text-emerald-700"}>{money(Number(d.unpaid))}</span> {d.openMonths > 0 && <span className="text-xs font-medium text-slate-500">· {t("openMonths", { n: num(d.openMonths) })}</span>}</Fact>
        <Fact label={t("deposit")}>{money(Number(d.deposit))}{d.settlement ? ` · ${t("settlement", { amount: money(Number(d.settlement)) })}` : ""}</Fact>
        {d.note && <div className="sm:col-span-2"><Fact label={t("note")}>{d.note}</Fact></div>}
      </dl>

      <section aria-label={t("residence")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("residence")}</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label={t("property")}>{d.residence.property}</Fact>
          <Fact label={t("unit")}>{t("unitValue", { unit: d.residence.unit, floor: d.residence.floor })}</Fact>
          <Fact label={t("location")}>{d.residence.location || t("none")}</Fact>
          <Fact label={t("rent")}>{money(Number(d.rent))}</Fact>
        </dl>
        {d.landlord && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/70 p-3">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-1.5 font-bold text-navy"><UserRound className="size-4 text-[#0A84F0]" aria-hidden />{d.landlord.fullName}{d.landlord.ownerCode && <span className="text-xs font-semibold text-[#0A84F0]">{tt("ownerId", { code: d.landlord.ownerCode })}</span>}</p>
              <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-slate-600"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden />{d.landlord.email ?? "—"}</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-600"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.landlord.phone)}</span></p>
            </div>
            <button type="button" onClick={() => onMessage({ id: d.landlord!.id, fullName: d.landlord!.fullName, avatarUrl: null })} className="btn btn-white h-10 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("messageLandlord")}</button>
          </div>
        )}
      </section>

      <section aria-label={t("ledger")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><ReceiptText className="size-3.5" aria-hidden />{t("ledger")} · {t("months", { n: num(d.ledger.length) })}</h3>
        {d.ledger.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noLedger")}</p> : (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg bg-white/70">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white/95"><tr className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">{t("col.month")}</th><th className="px-3 py-2">{t("col.total")}</th><th className="px-3 py-2">{t("col.paid")}</th><th className="px-3 py-2">{t("col.status")}</th></tr></thead>
              <tbody>{d.ledger.map((l) => (
                <tr key={l.id} className="border-t border-slate-200/60"><td className="px-3 py-1.5 font-semibold text-navy">{month(l.month)}</td><td className="px-3 py-1.5">{money(Number(l.total))}</td><td className="px-3 py-1.5">{money(Number(l.paid))}</td><td className="px-3 py-1.5"><span className={clsx("rounded-full px-2 py-0.5 font-bold", LEDGER_STYLE[l.status])}>{t(`ledgerStatus.${l.status}`)}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label={t("history")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("history")}</h3>
        {d.history.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noHistory")}</p> : (
          <ol className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {d.history.map((l) => (
              <li key={l.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
                <p className="flex flex-wrap items-center gap-x-2"><span className="font-bold text-navy">{t("edited")}</span>{l.rentStatus && <span className="text-slate-600">{t("rentWas", { status: trs(l.rentStatus as never) })}</span>}{l.reason && <span className="text-slate-600">· {tr(l.reason as never)}</span>}<span className="text-slate-500">· {when(l.at)}</span></p>
                {l.by && <p className="text-slate-500">{t("by", { name: l.by })}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

interface Props {
  row: ArchiveRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (p: Person) => void;
  /** the bottom section: Close for View, the form for Edit, Yes / Cancel for Delete */
  children: (d: ArchiveDetails | null) => React.ReactNode;
}

/** One window for View, Edit and Delete: the full record on top, the action at the bottom. */
export function TenantFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.previousTenants.table");
  const [d, setD] = useState<ArchiveDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<ArchiveDetails>(`/admin/previous-tenants/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[820px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={onMessage} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null)}</div>
        </div>
      )}
    </Modal>
  );
}
