"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, ChevronRight, History, Mail, MapPin, MessageCircle, Phone, RefreshCw, ShieldCheck, Tag } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import { Avatar, PLAN_ICON, STATE_STYLE } from "./OwnersTable";
import { ListingShortModal, PropertyShortModal } from "./ShortModals";
import type { ListingRecord, OwnerDetails, OwnerRow } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

const LOG_STYLE = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700", ARCHIVED: "bg-slate-200 text-slate-600" } as const;

function ListingList({ items, empty, onOpen, tone }: { items: ListingRecord[]; empty: string; onOpen: (id: string) => void; tone: string }) {
  const t = useTranslations("admin.owners.details");
  const locale = useLocale();
  if (items.length === 0) return <p className="mt-2 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
      {items.map((l) => (
        <li key={l.id}>
          <button type="button" onClick={() => onOpen(l.id)} aria-label={t("openListing", { title: l.title })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0">
            <span aria-hidden className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", tone)}><Tag className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{l.title}</span><span className="block truncate text-xs text-slate-500">{l.location || t("none")} · {day(locale, l.createdAt)}</span></span>
            <span className="shrink-0 text-sm font-bold text-navy">{formatTaka(locale)(Number(l.price))}</span>
            <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Body({ d, onMessage, onProperty, onListing }: { d: OwnerDetails; onMessage: () => void; onProperty: (id: string) => void; onListing: (id: string) => void }) {
  const t = useTranslations("admin.owners.details");
  const tt = useTranslations("admin.owners.table");
  const locale = useLocale();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  const plan = d.subscription ? PLAN_ICON[d.subscription.plan.code] ?? PLAN_ICON.PRIMARY! : null;
  const PlanIcon = plan?.icon;
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <Avatar name={d.fullName} url={d.avatarUrl} size="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.fullName}</h3>
          <p className="text-xs font-semibold text-[#0A84F0]">{d.ownerCode ? tt("ownerId", { code: d.ownerCode }) : `@${d.username}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{tt(`state.${d.state}`)}</span>
            {d.subscription && PlanIcon && <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-navy shadow-sm"><PlanIcon className={clsx("size-3.5", plan?.tone)} aria-hidden />{locale === "bn" ? d.subscription.plan.nameBn : d.subscription.plan.nameEn}</span>}
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[d.verificationStatus])}><ShieldCheck className="size-3.5" aria-hidden />{t(`nidState.${d.verificationStatus}`)}</span>
          </div>
        </div>
        <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={tt("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.phone)}</span></span></Fact>
        <Fact label={tt("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.email ?? t("none")}</span></Fact>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.address ?? t("none")}</span></Fact>
        <Fact label={t("occupation")}>{d.occupation ?? t("none")}</Fact>
        <Fact label={t("nid")}><span dir="ltr" className="font-mono">{d.nid ?? (d.nidLast4 ? `•••••••••${d.nidLast4}` : t("none"))}</span></Fact>
        <Fact label={t("dob")}>{d.dateOfBirth ? day(locale, d.dateOfBirth) : t("none")}</Fact>
        <Fact label={t("gender")}>{d.gender ? (t.has(`genders.${d.gender.toUpperCase()}` as never) ? t(`genders.${d.gender.toUpperCase()}` as never) : d.gender) : t("none")}</Fact>
        <Fact label={t("joined")}>{day(locale, d.createdAt)}</Fact>
        <Fact label={t("lastSeen")}>{d.lastSeenAt ? when(d.lastSeenAt) : t("none")}</Fact>
        <Fact label={t("paid")}>{formatTaka(locale)(Number(d.payments.total))} · {t("payments", { n: num(d.payments.count) })}</Fact>
        {d.subscription && <Fact label={t("subscription")}>{t("subscriptionLine", { cycle: t(`cycle.${d.subscription.cycle}`), until: d.subscription.endsAt ? day(locale, d.subscription.endsAt) : t("none") })}</Fact>}
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

      <section aria-label={t("portfolio")} className={card}>
        <h3 className={h}>{t("portfolio")}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["properties", "bg-sky-100 text-sky-700"], ["units", "bg-slate-100 text-navy"], ["occupied", "bg-emerald-100 text-emerald-700"], ["vacant", "bg-amber-100 text-amber-700"]] as const).map(([k, c]) => (
            <div key={k} className={clsx("rounded-lg px-3 py-2 text-center", c)}><dd className="text-xl font-bold leading-none">{num(d.totals[k])}</dd><dt className="mt-1 text-[0.68rem] font-semibold">{t(`totals.${k}`)}</dt></div>
          ))}
        </dl>
        {d.properties.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t("noProperties")}</p> : (
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {d.properties.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onProperty(p.id)} aria-label={t("openProperty", { name: p.name })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-[#0A84F0]"><Building2 className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.type.charAt(0) + p.type.slice(1).toLowerCase().replaceAll("_", " ")}{p.location ? ` · ${p.location}` : ""} · {t("floors", { n: num(p.totalFloors) })}</span></span>
                  <span className="shrink-0 text-right text-xs"><b className="text-navy">{t("unitsLine", { n: num(p.units) })}</b><br /><span className="text-emerald-600">{t("occupiedN", { n: num(p.occupied) })}</span> · <span className="text-amber-600">{t("vacantN", { n: num(p.vacant) })}</span></span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("marketplace")} className={card}>
        <h3 className={h}>{t("marketplace")}</h3>
        <dl className="mt-2 grid grid-cols-3 gap-2">
          <Fact label={t("forSale")}>{num(d.market.forSale)}</Fact><Fact label={t("sold")}>{num(d.market.sold)}</Fact><Fact label={t("soldValue")}>{formatTaka(locale)(Number(d.market.soldValue))}</Fact>
        </dl>
        <h4 className="mt-3 text-xs font-bold text-slate-600">{t("forSaleList")}</h4>
        <ListingList items={d.forSaleList} empty={t("noForSale")} onOpen={onListing} tone="bg-emerald-100 text-emerald-700" />
        <h4 className="mt-3 text-xs font-bold text-slate-600">{t("soldList")}</h4>
        <ListingList items={d.soldList} empty={t("noSold")} onOpen={onListing} tone="bg-slate-200 text-slate-600" />
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
  row: OwnerRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (d: OwnerDetails) => void;
  /** the bottom section of the window: nothing for View, the status form for Edit, Delete / Cancel for Delete */
  children: (d: OwnerDetails | null, reload: () => void) => React.ReactNode;
}

/** One window for View, Edit and Delete: the full owner profile on top, the action at the bottom. */
export function OwnerFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.owners.table");
  const [d, setD] = useState<OwnerDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [prop, setProp] = useState<string | null>(null);
  const [listing, setListing] = useState<string | null>(null);

  useEffect(() => {
    if (!row) { setD(null); setProp(null); setListing(null); return; }
    let live = true;
    setState("loading");
    authApi<OwnerDetails>(`/admin/active-owners/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <>
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[850px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage(d)} onProperty={setProp} onListing={setListing} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null, () => setTick((n) => n + 1))}</div>
        </div>
      )}
    </Modal>
    {row && <PropertyShortModal ownerId={row.id} id={prop} onClose={() => setProp(null)} />}
    {row && <ListingShortModal ownerId={row.id} id={listing} onClose={() => setListing(null)} />}
    </>
  );
}
