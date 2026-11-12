"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowUpCircle, Building2, ChevronRight, Heart, Home, Tag, History, Mail, MapPin, MessageCircle, Phone, ReceiptText, RefreshCw, Search, ShieldCheck, Star, UserRound, Users } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import { Open, OpenText } from "./nav";
import { RoleBadge } from "./ResultCard";
import type { FreePart, FullProfile, ListingRow, OwnerPart, TenantPart } from "./types";

const STATE_STYLE = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700" } as const;
const LOG_STYLE: Record<string, string> = { ACTIVE: "bg-emerald-100 text-emerald-700", WARNING: "bg-amber-100 text-amber-700", SUSPENDED: "bg-red-100 text-red-700", ARCHIVED: "bg-amber-100 text-amber-700", BANNED: "bg-red-100 text-red-700", INACTIVE: "bg-emerald-100 text-emerald-700", DELETED: "bg-slate-200 text-slate-600" };
const LEDGER_STYLE = { PAID: "bg-emerald-100 text-emerald-700", PARTIAL: "bg-amber-100 text-amber-700", DUE: "bg-orange-100 text-orange-700", OVERDUE: "bg-red-100 text-red-700" } as const;
const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className={h}>{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

function ListingList({ title, empty, items, tone }: { title: string; empty: string; items: ListingRow[]; tone: string }) {
  const t = useTranslations("admin.findPeople.owner");
  const locale = useLocale();
  return (
    <section className={card}>
      <h3 className={clsx(h, "flex items-center gap-1.5")}><Tag className="size-3.5" aria-hidden />{title} · {items.length}</h3>
      {items.length === 0 ? <p className="mt-2 text-sm text-slate-500">{empty}</p> : (
        <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
          {items.map((l) => (
            <li key={l.id}>
              <Open to={{ kind: "listing", id: l.id }} label={t("openListing", { title: l.title })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                <span aria-hidden className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", tone)}><Tag className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{l.title}</span><span className="block truncate text-xs text-slate-500">{[l.location, day(locale, l.createdAt)].filter(Boolean).join(" · ")}</span></span>
                <span className="shrink-0 text-sm font-bold text-navy">{formatTaka(locale)(Number(l.price))}</span>
                <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
              </Open>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OwnerSection({ o, listings }: { o: OwnerPart; listings: number }) {
  const t = useTranslations("admin.findPeople.owner");
  const locale = useLocale();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const tiles: [string, number, string][] = [[t("unitsTotal"), o.units.total, "text-navy"], [t("unitsOccupied"), o.units.occupied, "text-emerald-700"], [t("unitsVacant"), o.units.vacant, "text-sky-700"], [t("unitsRepair"), o.units.maintenance, "text-amber-700"]];
  return (
    <>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Star className="size-3.5" aria-hidden />{t("plan")}</h3>
        <p className="mt-1 text-sm font-semibold text-navy">
          {o.plan ? `${locale === "bn" ? o.plan.nameBn : o.plan.nameEn} · ${t(`planStatus.${o.plan.status}` as never)}${o.plan.endsAt ? ` · ${t("until", { date: day(locale, o.plan.endsAt) })}` : ""}` : t("noPlan")}
        </p>
        <p className="text-xs text-slate-500">{t("listings", { n: num(listings) })}</p>
      </section>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("units")}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([label, n, tone]) => <div key={label} className="rounded-lg bg-white/70 p-2.5 text-center"><p className={clsx("text-2xl font-bold", tone)}>{num(n)}</p><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>)}
        </div>
      </section>
      <section className={card}>
        <h3 className={h}>{t("properties")} · {num(o.properties.length)}</h3>
        {o.properties.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noProperties")}</p> : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {o.properties.map((p) => (
              <li key={p.id}>
                <Open to={{ kind: "property", id: p.id }} label={t("openProperty", { name: p.name })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-[#0A84F0]"><Building2 className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{p.name}</span><span className="block truncate text-xs text-slate-500">{[t("unitCount", { n: num(p.units) }), p.location].filter(Boolean).join(" · ")}</span></span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </Open>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ListingList title={t("forSale")} empty={t("noForSale")} items={o.forSale} tone="bg-emerald-100 text-emerald-700" />
      <ListingList title={t("sold")} empty={t("noSold")} items={o.sold} tone="bg-slate-200 text-slate-600" />
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Home className="size-3.5" aria-hidden />{t("allUnits")} · {num(o.unitList.length)}</h3>
        {o.unitList.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noUnits")}</p> : (
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {o.unitList.map((u) => (
              <li key={u.id}>
                <Open to={{ kind: "unit", id: u.id }} label={t("openUnit", { unit: u.unitNumber })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{t("unitName", { unit: u.unitNumber })} <span className="text-xs font-medium text-slate-500">· {u.property}</span></span><span className="block truncate text-xs text-slate-500">{u.tenant ?? t("vacantUnit")} · {t("floorN", { n: num(u.floor) })}</span></span>
                  <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", u.availability === "OCCUPIED" ? "bg-emerald-100 text-emerald-700" : u.availability === "MAINTENANCE" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700")}>{t(`unitState.${u.availability}` as never)}</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </Open>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Users className="size-3.5" aria-hidden />{t("tenants")} · {num(o.tenants.length)}</h3>
        {o.tenants.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noTenants")}</p> : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {o.tenants.map((x) => (
              <li key={`${x.id}${x.unitId}`}>
                <Open to={{ kind: "person", id: x.id }} label={t("openPerson", { name: x.name })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{x.name}{x.code && <span className="ml-2 text-xs font-semibold text-[#0A84F0]">{x.code}</span>}</span><span className="block truncate text-xs text-slate-500">{x.property} · {x.unit} · {t("since", { date: day(locale, x.since) })}</span></span>
                  <span className="shrink-0 text-sm font-bold text-navy">{formatTaka(locale)(Number(x.rent))}</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </Open>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function TenantSection({ tn }: { tn: TenantPart }) {
  const t = useTranslations("admin.findPeople.tenant");
  const locale = useLocale();
  const money = formatTaka(locale);
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
  const r = tn.residence;
  if (!r) return <section className={card}><p className="text-sm text-slate-600">{t("none")}</p><p className="mt-1 text-xs text-slate-500">{t("previous", { n: tn.previousTenancies })}</p></section>;
  return (
    <>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("residence")}</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label={t("property")}><OpenText to={{ kind: "property", id: r.propertyId }} label={t("openProperty", { name: r.property })}>{r.property}</OpenText></Fact>
          <Fact label={t("unit")}><OpenText to={{ kind: "unit", id: r.unitId }} label={t("openUnit", { unit: r.unit })}>{t("unitValue", { unit: r.unit, floor: r.floor })}</OpenText></Fact>
          <Fact label={t("location")}>{r.location || t("noneShort")}</Fact>
          <Fact label={t("rent")}>{money(Number(r.rent))}</Fact>
          <Fact label={t("leaseStart")}>{day(locale, r.startDate)}</Fact>
          <Fact label={t("leaseEnd")}>{r.endDate ? day(locale, r.endDate) : t("open")}{r.noticeGiven && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-bold text-amber-700">{t("notice")}</span>}</Fact>
          <Fact label={t("deposit")}>{money(Number(r.deposit))}</Fact>
          <Fact label={t("previousLabel")}>{t("previous", { n: tn.previousTenancies })}</Fact>
        </dl>
      </section>
      {tn.landlord && (
        <section className={card}>
          <h3 className={clsx(h, "flex items-center gap-1.5")}><UserRound className="size-3.5" aria-hidden />{t("landlord")}</h3>
          <p className="mt-1 text-sm font-bold text-navy"><OpenText to={{ kind: "person", id: tn.landlord.id }} label={t("openPerson", { name: tn.landlord.fullName })}>{tn.landlord.fullName}</OpenText>{tn.landlord.ownerCode && <span className="ml-2 text-xs font-semibold text-[#0A84F0]">{tn.landlord.ownerCode}</span>}</p>
          <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-slate-600"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden />{tn.landlord.email ?? "—"}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-600"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(tn.landlord.phone)}</span></p>
        </section>
      )}
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><ReceiptText className="size-3.5" aria-hidden />{t("ledger")}</h3>
        {tn.ledger.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noLedger")}</p> : (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg bg-white/70">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white/95"><tr className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">{t("col.month")}</th><th className="px-3 py-2">{t("col.total")}</th><th className="px-3 py-2">{t("col.paid")}</th><th className="px-3 py-2">{t("col.status")}</th></tr></thead>
              <tbody>{tn.ledger.map((l) => <tr key={l.id} className="border-t border-slate-200/60"><td className="px-3 py-1.5 font-semibold text-navy">{month(l.month)}</td><td className="px-3 py-1.5">{money(Number(l.total))}</td><td className="px-3 py-1.5">{money(Number(l.paid))}</td><td className="px-3 py-1.5"><span className={clsx("rounded-full px-2 py-0.5 font-bold", LEDGER_STYLE[l.status])}>{t(`ledgerStatus.${l.status}`)}</span></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function FreeSection({ f }: { f: FreePart }) {
  const t = useTranslations("admin.findPeople.free");
  const locale = useLocale();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  return (
    <>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><ArrowUpCircle className="size-3.5" aria-hidden />{t("upgrade")}</h3>
        {f.upgrade ? (
          <p className="mt-1 text-sm font-semibold text-navy">{t(`upgradeStatus.${f.upgrade.status}` as never)} · {locale === "bn" ? f.upgrade.planBn : f.upgrade.planEn} · {formatTaka(locale)(Number(f.upgrade.amount))} · {day(locale, f.upgrade.at)}{f.upgrade.rejectionReason && <span className="mt-0.5 block text-xs font-medium text-red-600">{f.upgrade.rejectionReason}</span>}</p>
        ) : <p className="mt-1 text-sm text-slate-600">{t("noUpgrade")}</p>}
      </section>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Heart className="size-3.5" aria-hidden />{t("saved")} · {num(f.favoriteCount)}</h3>
        {f.favorites.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noSaved")}</p> : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {f.favorites.map((x) => (
              <li key={x.id}>
                <Open to={{ kind: "listing", id: x.listingId }} label={t("openListing", { title: x.title })} className="group flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-navy">{x.title}</span><span className="block truncate text-xs text-slate-500">{[x.location, day(locale, x.savedAt)].filter(Boolean).join(" · ")}</span></span>
                  <span className="shrink-0 text-sm font-bold text-navy">{formatTaka(locale)(Number(x.price))}</span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </Open>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><Search className="size-3.5" aria-hidden />{t("searches")} · {num(f.searchCount)}</h3>
        {f.searches.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noSearches")}</p> : (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {f.searches.map((x) => <li key={x.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs"><span className="font-semibold text-navy">{day(locale, x.at)}</span><span className="text-slate-600"> · {x.summary || t("anySearch")}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );
}

function Body({ d, onMessage }: { d: FullProfile; onMessage: () => void }) {
  const t = useTranslations("admin.findPeople.profile");
  const tf = useTranslations("admin.findPeople");
  const locale = useLocale();
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const code = d.ownerCode ?? d.tenantCode;
  const none = t("none");
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <span className="relative shrink-0"><Avatar name={d.fullName} url={d.avatarUrl} size="size-16" /><span aria-hidden className={clsx("absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-white", d.online ? "bg-emerald-500" : "bg-slate-300")} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.fullName}</h3>
          <p className="text-xs font-semibold text-[#0A84F0]">{code ? tf("id", { code }) : `@${d.username}`}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <RoleBadge role={d.role} />
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${d.state}`)}</span>
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[d.verificationStatus])}><ShieldCheck className="size-3.5" aria-hidden />{tf(`nid.${d.verificationStatus}`)}</span>
            {d.archived && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600">{tf("archived")}</span>}
          </div>
        </div>
        <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={t("nid")}><span dir="ltr" className="font-mono">{d.nid ?? none}</span></Fact>
        <Fact label={t("online")}><span className={clsx("inline-flex items-center gap-1.5", d.online ? "text-emerald-700" : "text-slate-600")}><i aria-hidden className={clsx("size-2 rounded-full", d.online ? "bg-emerald-500" : "bg-slate-300")} />{d.online ? t("onlineNow") : d.lastSeenAt ? t("lastSeen", { time: when(d.lastSeenAt) }) : t("offline")}</span></Fact>
        <Fact label={t("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.email ?? none}</span></Fact>
        <Fact label={t("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.phone)}</span></span></Fact>
        <Fact label={t("joined")}>{day(locale, d.createdAt)}</Fact>
        <Fact label={t("username")}><span dir="ltr">@{d.username}</span></Fact>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.address || none}</span></Fact>
        <Fact label={t("occupation")}>{d.occupation ?? none}</Fact>
        <Fact label={t("dob")}>{d.dateOfBirth ? day(locale, d.dateOfBirth) : none}</Fact>
        <Fact label={t("gender")}>{d.gender ? (t.has(`genders.${d.gender.toUpperCase()}` as never) ? t(`genders.${d.gender.toUpperCase()}` as never) : d.gender) : none}</Fact>
      </dl>

      {d.owner && <OwnerSection o={d.owner} listings={d.listings} />}
      {d.tenant && <TenantSection tn={d.tenant} />}
      {d.free && <FreeSection f={d.free} />}

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

interface Props { personId: string | null; canGoBack: boolean; onClose: () => void; onMessage: (p: { id: string; fullName: string; avatarUrl: string | null }) => void }

/** The full profile of a found person (about 850px): header, then the part that fits the role. */
export function ProfileModal({ personId, canGoBack, onClose, onMessage }: Props) {
  const t = useTranslations("admin.findPeople.profile");
  const [d, setD] = useState<FullProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!personId) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<FullProfile>(`/admin/find-people/${personId}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch((e) => { if (live) setState(e instanceof ApiError && e.code === "NOT_FOUND" ? "gone" : "error"); });
    return () => { live = false; };
  }, [personId, tick]);

  return (
    <Modal open={!!personId} onClose={onClose} labelledBy="fp-title" maxWidth="max-w-[850px]">
      {personId && (
        <div>
          <h2 id="fp-title" className="pr-10 text-xl font-bold text-navy">{t("title")}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {(state === "error" || state === "gone") && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{state === "gone" ? t("gone") : t("error")}</p>
              {state === "error" && <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>}</div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage({ id: d.id, fullName: d.fullName, avatarUrl: d.avatarUrl })} /></div>}
          <div className="mt-5 flex justify-end border-t border-slate-200/70 pt-4"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{canGoBack ? <><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</> : t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}
