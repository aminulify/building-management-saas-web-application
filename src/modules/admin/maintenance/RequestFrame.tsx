"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, ChevronRight, ImageOff, Mail, Phone, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka, initialsOf } from "../dashboard/format";
import { day } from "../manage-home/format";
import { PRIORITY_STYLE, STATUS_STYLE } from "./RequestsTable";
import { ticket, type ReqDetails, type ReqPriority, type ReqRow, type ReqStatus } from "./types";

function Avatar({ name, url, size = "size-12" }: { name: string; url: string | null; size?: string }) {
  return url ? <img src={url} alt="" className={clsx(size, "shrink-0 rounded-full border border-white object-cover shadow-sm")} /> : <span aria-hidden className={clsx(size, "grid shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white")}>{initialsOf(name)}</span>;
}

type Who = "tenant" | "owner";

/** Short profile: who they are and how to reach them, opened from the tenant or owner block. */
function PersonModal({ d, who, onClose }: { d: ReqDetails; who: Who | null; onClose: () => void }) {
  const t = useTranslations("admin.maintenance.person");
  const locale = useLocale();
  const p = who === "tenant" ? d.tenant : who === "owner" ? d.owner : null;
  const code = who === "tenant" ? d.tenant.tenantCode : d.owner.ownerCode;
  const rows: [string, React.ReactNode][] = !p || !who ? [] : who === "tenant"
    ? [[t("unit"), `${d.property.name} · ${d.unit.unitNumber}`], [t("movedIn"), day(locale, d.tenant.movedIn)], [t("rent"), formatTaka(locale)(Number(d.tenant.rent))], [t("memberSince"), d.tenant.memberSince ? day(locale, d.tenant.memberSince) : t("none")]]
    : [[t("properties"), new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(d.owner.properties)], [t("tenants"), new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(d.owner.tenants)], [t("memberSince"), d.owner.memberSince ? day(locale, d.owner.memberSince) : t("none")]];
  return (
    <Modal open={!!who && !!p} onClose={onClose} labelledBy="mr-person" maxWidth="max-w-[420px]">
      {who && p && (
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t(who)}</p>
          <div className="mt-2 flex items-center gap-3 pr-8">
            <Avatar name={p.fullName} url={p.avatarUrl} size="size-16" />
            <div className="min-w-0"><h2 id="mr-person" className="truncate text-xl font-bold text-navy">{p.fullName}</h2>{code && <p className="text-sm font-semibold text-[#0A84F0]">{t(who === "tenant" ? "tenantId" : "ownerId", { code })}</p>}</div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2 text-slate-700"><Phone className="size-4 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{p.phone ? formatPhone(p.phone) : t("none")}</span></li>
            <li className="flex items-center gap-2 break-all text-slate-700"><Mail className="size-4 shrink-0 text-[#9333EA]" aria-hidden />{p.email ?? t("none")}</li>
          </ul>
          <dl className="mt-4 grid gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 sm:grid-cols-2">
            {rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{k}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{v}</dd></div>)}
          </dl>
          <div className="mt-5 flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-11 sm:min-w-28">{t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

function Body({ d, onPerson }: { d: ReqDetails; onPerson: (w: Who) => void }) {
  const t = useTranslations("admin.maintenance.details");
  const tt = useTranslations("admin.maintenance.table");
  const tc = useTranslations("admin.maintenance.category");
  const locale = useLocale();
  const [photo, setPhoto] = useState(0);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const cat = (c: string) => (tc.has(`names.${c}` as never) ? tc(`names.${c}` as never) : c.charAt(0) + c.slice(1).toLowerCase());
  const img = d.images[photo]?.url ?? null;
  const p = d.property;
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";

  const person = (who: Who) => {
    const x = who === "tenant" ? d.tenant : d.owner;
    const code = who === "tenant" ? d.tenant.tenantCode : d.owner.ownerCode;
    return (
      <button type="button" onClick={() => onPerson(who)} aria-label={t("openProfile", { name: x.fullName })} className={clsx(card, "group flex w-full items-center gap-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[#48BDFA] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0")}>
        <Avatar name={x.fullName} url={x.avatarUrl} />
        <span className="min-w-0 flex-1 text-sm">
          <span className={h}>{t(who)}</span>
          <span className="block truncate font-bold text-navy">{x.fullName}</span>
          {code && <span className="block text-xs font-semibold text-[#0A84F0]">{t(who === "tenant" ? "tenantId" : "ownerId", { code })}</span>}
          <span className="block text-xs text-slate-500" dir="ltr">{x.phone ? formatPhone(x.phone) : t("none")}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        {img ? <img src={img} alt={t("photoOf", { n: photo + 1 })} className="max-h-64 w-full rounded-xl border border-white object-cover shadow-sm" /> : (
          <div className="grid h-32 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-400"><span><ImageOff className="mx-auto size-6" aria-hidden /><span className="mt-1 block text-sm">{t("noPhotos")}</span></span></div>
        )}
        {d.images.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto">{d.images.map((im, i) => im.url && <button key={im.id} type="button" onClick={() => setPhoto(i)} aria-label={t("photoOf", { n: i + 1 })} aria-pressed={i === photo} className={clsx("size-14 shrink-0 overflow-hidden rounded-lg border-2", i === photo ? "border-[#0A84F0]" : "border-transparent")}><img src={im.url} alt="" className="size-full object-cover" /></button>)}</div>}
      </div>

      <div><h3 className="text-lg font-bold text-navy">{d.title}</h3><p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{d.description}</p></div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-3")}>
        <Fact label={t("ticket")}><span className="font-mono">{ticket(d.ticketNo)}</span></Fact>
        <Fact label={t("category")}>{cat(d.category)}</Fact>
        <Fact label={t("priority")}><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", PRIORITY_STYLE[d.priority as ReqPriority])}>{tt(`priority.${d.priority}`)}</span></Fact>
        <Fact label={t("status")}><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_STYLE[d.status as ReqStatus])}>{tt(`status.${d.status}`)}</span></Fact>
        <Fact label={t("created")}>{when(d.createdAt)}</Fact>
        <Fact label={t("resolved")}>{d.resolvedAt ? when(d.resolvedAt) : t("none")}</Fact>
        <Fact label={t("preferred")}>{d.preferredAt ? when(d.preferredAt) : t("none")}</Fact>
        <Fact label={t("technician")}>{d.technicianName ?? t("none")}</Fact>
      </dl>

      <section aria-label={t("apartment")} className={card}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-[#0A84F0]"><Building2 className="size-5" /></span>
          <div className="min-w-0"><h3 className="font-bold text-navy">{p.name}</h3><p className="text-xs text-slate-500">{p.type.charAt(0) + p.type.slice(1).toLowerCase().replaceAll("_", " ")}{p.location ? ` · ${p.location}` : ""}</p></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={t("floors")}>{num(p.totalFloors)}</Fact>
          <Fact label={t("flats")}>{num(p.flats)}</Fact>
          <Fact label={t("occupied")}><span className="text-emerald-600">{num(p.occupied)}</span></Fact>
          <Fact label={t("vacant")}><span className="text-amber-600">{num(p.vacant)}</span></Fact>
        </dl>
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">{t("thisFlat", { unit: d.unit.unitNumber, floor: num(d.unit.floor), beds: num(d.unit.bedrooms), baths: num(d.unit.bathrooms) })}{d.unit.areaSqft ? ` · ${num(d.unit.areaSqft)} ${t("sqft")}` : ""}</p>
      </section>

      <section aria-label={t("issuesHere")} className={card}>
        <h3 className={h}>{t("issuesHere")}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["total", "bg-slate-100 text-navy"], ["open", "bg-amber-100 text-amber-700"], ["resolved", "bg-emerald-100 text-emerald-700"], ["other", "bg-slate-200 text-slate-600"]] as const).map(([k, c]) => (
            <div key={k} className={clsx("rounded-lg px-3 py-2 text-center", c)}><dd className="text-xl font-bold leading-none">{num(p.issues[k])}</dd><dt className="mt-1 text-[0.68rem] font-semibold">{t(`issues.${k}`)}</dt></div>
          ))}
        </dl>
        <h4 className="mt-3 text-xs font-bold text-slate-600">{t("recent")}</h4>
        <ul className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto">
          {p.recent.map((x) => (
            <li key={x.id} className={clsx("flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs", x.id === d.id && "ring-1 ring-[#48BDFA]")}>
              <span className="min-w-0 truncate"><b className="font-mono text-[#0A84F0]">{ticket(x.ticketNo)}</b> <span className="text-navy">{x.title}</span> <span className="text-slate-500">· {t("flatFloor", { unit: x.unitNumber, floor: num(x.floor) })}</span></span>
              <span className={clsx("shrink-0 rounded-full px-2 py-0.5 font-bold", STATUS_STYLE[x.status as ReqStatus])}>{tt(`status.${x.status}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">{person("tenant")}{person("owner")}</div>

      <div>
        <h3 className={h}>{t("comments")}</h3>
        {d.comments.length === 0 ? <p className="mt-1 text-sm text-slate-500">{t("noComments")}</p> : (
          <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">{d.comments.map((c) => <li key={c.id} className="rounded-lg bg-slate-50 p-2.5 text-sm"><p className="text-xs font-bold text-navy">{c.author} <span className="font-medium text-slate-500">· {when(c.createdAt)}</span></p><p className="mt-0.5 break-words text-slate-700">{c.body}</p></li>)}</ul>
        )}
      </div>
    </div>
  );
}

interface Props {
  row: ReqRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string;
  /** the bottom section of the window (nothing for View, the form for Edit, Delete / Cancel for Delete) */
  children: (d: ReqDetails | null) => React.ReactNode;
}

/** One window for View, Edit and Delete: the full request on top (apartment, issues of the apartment, tenant and owner), the action at the bottom. */
export function RequestFrame({ row, busy = false, onClose, labelledBy, title, children }: Props) {
  const tt = useTranslations("admin.maintenance.table");
  const [d, setD] = useState<ReqDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [who, setWho] = useState<Who | null>(null);

  useEffect(() => {
    if (!row) { setD(null); setWho(null); return; }
    let live = true;
    setState("loading");
    authApi<ReqDetails>(`/admin/maintenance/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <>
      <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[800px]">
        {row && (
          <div>
            <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title} <span className="font-mono text-base text-[#0A84F0]">{ticket(row.ticketNo)}</span></h2>
            {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-40 w-full rounded-xl" /><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-24 w-full rounded-xl" /></div>}
            {state === "error" && (
              <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
                <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
            )}
            {state === "ready" && d && <div className="mt-4"><Body d={d} onPerson={setWho} /></div>}
            <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null)}</div>
          </div>
        )}
      </Modal>
      {d && <PersonModal d={d} who={who} onClose={() => setWho(null)} />}
    </>
  );
}
