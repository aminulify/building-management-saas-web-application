"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, EyeOff, Eye, History, IdCard, Mail, MapPin, MessageCircle, Phone, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import type { FreeDetails, FreeRow } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}
const LOG_STYLE = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700", ARCHIVED: "bg-slate-200 text-slate-600" } as const;

function Body({ d, onMessage }: { d: FreeDetails; onMessage: () => void }) {
  const t = useTranslations("admin.tenantFree.details");
  const tt = useTranslations("admin.tenantFree.table");
  const locale = useLocale();
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  const verified = d.verificationStatus === "VERIFIED";
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <Avatar name={d.fullName} url={d.avatarUrl} size="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.fullName}</h3>
          <p className="text-xs font-semibold text-[#0A84F0]">{d.tenantCode ? tt("freeId", { code: d.tenantCode }) : `@${d.username}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[d.verificationStatus])}>{verified ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}{t(`nidState.${d.verificationStatus}`)}</span>
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", d.state === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{tt(`state.${d.state}`)}</span>
          </div>
        </div>
        <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
      </div>

      <div className={clsx("flex items-start gap-3 rounded-xl border p-3 text-sm", d.visibleToOwners ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-amber-200 bg-amber-50/70 text-amber-800")}>
        {d.visibleToOwners ? <Eye className="mt-0.5 size-4 shrink-0" aria-hidden /> : <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <div><p className="font-bold">{t(d.visibleToOwners ? "visibleTitle" : "hiddenTitle")}</p><p className="text-xs">{d.visibleToOwners ? t("visibleText") : t("hiddenText", { gaps: [...d.gaps.map((g) => t(`gap.${g}` as never)), ...(verified ? [] : [t("gap.verification")])].join(", ") })}</p></div>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={tt("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.phone)}</span></span></Fact>
        <Fact label={tt("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.email ?? t("none")}</span></Fact>
        <Fact label={t("nid")}><span className="flex items-center gap-1.5"><IdCard className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr" className="font-mono">{d.nid ?? (d.nidLast4 ? `•••••••••${d.nidLast4}` : t("none"))}</span></span></Fact>
        <Fact label={t("occupation")}>{d.occupation ?? t("none")}</Fact>
        <Fact label={t("dob")}>{d.dateOfBirth ? day(locale, d.dateOfBirth) : t("none")}</Fact>
        <Fact label={t("gender")}>{d.gender ? (t.has(`genders.${d.gender.toUpperCase()}` as never) ? t(`genders.${d.gender.toUpperCase()}` as never) : d.gender) : t("none")}</Fact>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.address ?? t("none")}</span></Fact>
        <Fact label={t("joined")}>{day(locale, d.createdAt)}</Fact>
        <Fact label={t("lastSeen")}>{d.lastSeenAt ? when(d.lastSeenAt) : t("none")}</Fact>
      </dl>

      <section aria-label={t("documents")} className={card}>
        <h3 className={h}>{t("documents")}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {([["nidFront", "NID_FRONT"], ["nidBack", "NID_BACK"]] as const).map(([f, k]) => {
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

      <section aria-label={t("log")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("log")}</h3>
        {d.log.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noLog")}</p> : (
          <ol className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {d.log.map((l) => (
              <li key={l.id} className="rounded-lg bg-white/70 p-2.5 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs"><span className={clsx("rounded-full px-2 py-0.5 font-bold", LOG_STYLE[l.action])}>{t(`logAction.${l.action}`)}</span><span className="font-semibold text-navy">{l.adminUsername}</span><span className="text-slate-500">· {when(l.createdAt)}</span></p>
                {l.comment && <p className="mt-1 break-words text-slate-700">{l.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

interface Props {
  row: FreeRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (d: FreeDetails) => void;
  /** the bottom section: nothing for View, the account status and the NID review for Edit */
  children: (d: FreeDetails | null, reload: () => void) => React.ReactNode;
}

/** One window for View and Edit: the full profile on top, the action at the bottom. */
export function FreeFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.tenantFree.table");
  const [d, setD] = useState<FreeDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<FreeDetails>(`/admin/tenant-free/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[820px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-16 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage(d)} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null, () => setTick((n) => n + 1))}</div>
        </div>
      )}
    </Modal>
  );
}
