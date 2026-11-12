"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, History, Mail, MapPin, MessageCircle, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import { StateBadge, STATE_STYLE } from "./OwnersTable";
import type { ArchiveDetails, ArchiveRow } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

const LOG_STYLE: Record<ArchiveDetails["log"][number]["action"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700", ARCHIVED: "bg-amber-100 text-amber-700",
  BANNED: "bg-red-100 text-red-700", INACTIVE: "bg-emerald-100 text-emerald-700", DELETED: "bg-slate-200 text-slate-600",
};

function Body({ d, onMessage }: { d: ArchiveDetails; onMessage: () => void }) {
  const t = useTranslations("admin.previousOwners.details");
  const tr = useTranslations("admin.previousOwners.reason");
  const tt = useTranslations("admin.previousOwners.table");
  const locale = useLocale();
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <Avatar name={d.fullName} url={d.avatarUrl} size="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.fullName}</h3>
          <p className="text-xs font-semibold text-[#0A84F0]">{d.ownerCode ? tt("ownerId", { code: d.ownerCode }) : `@${d.username}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StateBadge state={d.state} />
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[d.verificationStatus])}><ShieldCheck className="size-3.5" aria-hidden />{t(`nid.${d.verificationStatus}`)}</span>
          </div>
        </div>
        <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={tt("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.phone)}</span></span></Fact>
        <Fact label={tt("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.email ?? t("none")}</span></Fact>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.address || t("none")}</span></Fact>
        <Fact label={t("occupation")}>{d.occupation ?? t("none")}</Fact>
        <Fact label={t("nidNumber")}><span dir="ltr" className="font-mono">{d.nid ?? t("none")}</span></Fact>
        <Fact label={t("dob")}>{d.dateOfBirth ? day(locale, d.dateOfBirth) : t("none")}</Fact>
        <Fact label={t("joined")}>{day(locale, d.createdAt)}</Fact>
        <Fact label={t("lastSeen")}>{d.lastSeenAt ? when(d.lastSeenAt) : t("none")}</Fact>
        <Fact label={t("paid")}>{formatTaka(locale)(Number(d.paid.total))} · {t("payments", { n: num(d.paid.count) })}</Fact>
        <Fact label={t("lastPlan")}>{d.lastPlan ? `${locale === "bn" ? d.lastPlan.nameBn : d.lastPlan.nameEn}${d.lastPlan.endsAt ? ` · ${t("until", { date: day(locale, d.lastPlan.endsAt) })}` : ""}` : t("none")}</Fact>
      </dl>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 border-amber-200/80 bg-amber-50/40 sm:grid-cols-2")}>
        <Fact label={t("leftDate")}>{day(locale, d.leftAt)}</Fact>
        <Fact label={t("reason")}><span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}>{tr(d.reasonCode)}</span></Fact>
        {d.reasonNote && <div className="sm:col-span-2"><Fact label={t("note")}>{d.reasonNote}</Fact></div>}
      </dl>

      <section aria-label={t("portfolio")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("portfolio")} · {t("portfolioCount", { n: num(d.properties.length) })} · {t("listings", { n: num(d.listings) })}</h3>
        {d.properties.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noProperties")}</p> : (
          <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto">
            {d.properties.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-[#0A84F0]"><Building2 className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{p.name}</span><span className="block truncate text-xs text-slate-500">{[t("units", { n: num(p.units) }), p.location].filter(Boolean).join(" · ")}</span></span>
                <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-bold", p.archived ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700")}>{p.archived ? t("propArchived") : t("propLive")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("log")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("log")}</h3>
        {d.log.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noLog")}</p> : (
          <ol className="mt-2 max-h-52 space-y-2 overflow-y-auto">
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
  row: ArchiveRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (d: ArchiveDetails) => void;
  /** the bottom section: Close for View, the status form for Edit, Yes / Cancel for Delete */
  children: (d: ArchiveDetails | null) => React.ReactNode;
}

/** One window for View, Edit and Delete: the full owner record on top, the action at the bottom. */
export function OwnerFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.previousOwners.table");
  const [d, setD] = useState<ArchiveDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<ArchiveDetails>(`/admin/previous-owners/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[850px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage(d)} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null)}</div>
        </div>
      )}
    </Modal>
  );
}
