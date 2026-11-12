"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, IdCard, Mail, MapPin, MessageCircle, Phone, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { STATE_STYLE, VERIFY_STYLE } from "./TenantsTable";
import type { Person, TenantDetails, TenantRow } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

function Body({ d, onMessage }: { d: TenantDetails; onMessage: (p: Person) => void }) {
  const t = useTranslations("admin.tenants.details");
  const tt = useTranslations("admin.tenants.table");
  const locale = useLocale();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  const x = d.tenant, r = d.residence;
  const verified = x.verificationStatus === "VERIFIED";
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <Avatar name={x.fullName} url={x.avatarUrl} size="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{x.fullName}</h3>
          <p className="text-xs font-semibold text-[#0A84F0]">{x.tenantCode ? tt("tenantId", { code: x.tenantCode }) : `@${x.username}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{tt(`state.${d.state}`)}</span>
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[x.verificationStatus])}>{verified ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}{t(`nidState.${x.verificationStatus}`)}</span>
          </div>
        </div>
        <button type="button" onClick={() => onMessage(x)} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={tt("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(x.phone)}</span></span></Fact>
        <Fact label={tt("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{x.email ?? t("none")}</span></Fact>
        <Fact label={t("nid")}><span className="flex items-center gap-1.5"><IdCard className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr" className="font-mono">{x.nid ?? (x.nidLast4 ? `•••••••••${x.nidLast4}` : t("none"))}</span></span></Fact>
        <Fact label={t("occupation")}>{x.occupation ?? t("none")}</Fact>
        <Fact label={t("dob")}>{x.dateOfBirth ? day(locale, x.dateOfBirth) : t("none")}</Fact>
        <Fact label={t("gender")}>{x.gender ? (t.has(`genders.${x.gender.toUpperCase()}` as never) ? t(`genders.${x.gender.toUpperCase()}` as never) : x.gender) : t("none")}</Fact>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{x.address ?? t("none")}</span></Fact>
        <Fact label={t("memberSince")}>{x.memberSince ? day(locale, x.memberSince) : t("none")}</Fact>
        <Fact label={t("lastSeen")}>{x.lastSeenAt ? when(x.lastSeenAt) : t("none")}</Fact>
      </dl>

      <section aria-label={t("residence")} className={card}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-[#0A84F0]"><Building2 className="size-5" /></span>
          <div className="min-w-0"><h3 className="font-bold text-navy">{r.property} <span className="font-semibold text-slate-600">({tt("unit", { n: r.unit })})</span></h3><p className="flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-0.5 size-3 shrink-0 text-rose-500" aria-hidden />{r.location || t("none")}</p></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={t("floor")}>{num(r.floor)}</Fact><Fact label={t("bedBath")}>{num(r.bedrooms)} / {num(r.bathrooms)}</Fact>
          <Fact label={t("area")}>{r.areaSqft ? `${num(r.areaSqft)} ${t("sqft")}` : t("none")}</Fact><Fact label={t("members")}>{num(d.members)}</Fact>
        </dl>
      </section>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-3")}>
        <Fact label={t("rent")}>{formatTaka(locale)(Number(d.rent))}</Fact>
        <Fact label={t("deposit")}>{formatTaka(locale)(Number(d.deposit))}</Fact>
        <Fact label={t("dues")}><span className={Number(d.ledger.due) > 0 ? "text-red-600" : "text-emerald-600"}>{formatTaka(locale)(Number(d.ledger.due))}</span>{d.ledger.overdue > 0 && <span className="ml-1.5 text-xs text-red-600">{t("overdue", { n: num(d.ledger.overdue) })}</span>}</Fact>
        <Fact label={t("leaseStart")}>{day(locale, d.startDate)}</Fact>
        <Fact label={t("leaseEnd")}>{d.endDate ? day(locale, d.endDate) : t("noEnd")}</Fact>
        <Fact label={t("notice")}>{d.noticeGivenAt ? day(locale, d.noticeGivenAt) : t("none")}</Fact>
      </dl>

      <section aria-label={t("documents")} className={card}>
        <h3 className={h}>{t("documents")}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {([["nidFront", "NID_FRONT"], ["nidBack", "NID_BACK"], ["agreement", "AGREEMENT"]] as const).map(([f, k]) => {
            const doc = d.documents[f];
            return (
              <li key={k} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-navy">{t(`docs.${k}`)}</span>
                <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-bold", doc ? VERIFY_STYLE[doc.status] : "bg-slate-200 text-slate-600")}>{doc ? t(`docState.${doc.status}`) : t("docNone")}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label={t("owner")} className={card}>
        <h3 className={h}>{t("owner")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Avatar name={d.owner.fullName} url={d.owner.avatarUrl} size="size-12" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-bold text-navy">{d.owner.fullName}</p>
            {d.owner.ownerCode && <p className="text-xs font-semibold text-[#0A84F0]">{tt("ownerId", { code: d.owner.ownerCode })}</p>}
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{d.owner.phone ? formatPhone(d.owner.phone) : t("none")}</span></p>
            {d.owner.email && <p className="flex items-center gap-1.5 break-all text-xs text-slate-500"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden />{d.owner.email}</p>}
          </div>
          <button type="button" onClick={() => onMessage(d.owner)} className="btn btn-white h-10 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("messageOwner")}</button>
        </div>
      </section>
    </div>
  );
}

interface Props {
  row: TenantRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (p: Person) => void;
  /** the bottom section: nothing for View, the form for Edit */
  children: (d: TenantDetails | null, reload: () => void) => React.ReactNode;
}

/** One window for View and Edit: the full tenant profile on top, the action at the bottom. */
export function TenantFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.tenants.table");
  const [d, setD] = useState<TenantDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<TenantDetails>(`/admin/active-tenants/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[820px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={onMessage} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null, () => setTick((n) => n + 1))}</div>
        </div>
      )}
    </Modal>
  );
}
