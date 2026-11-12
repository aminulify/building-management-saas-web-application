"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Bath, BedDouble, Building2, Check, ImageOff, MapPin, Phone, ReceiptText, RefreshCw, Ruler, Star, UserRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { AMENITY_CODES } from "../properties/amenities";
import { Open, OpenText } from "./nav";
import type { ListingFull, PersonRef, PropertyFull, UnitFull } from "./types";

const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
const AVAIL_STYLE: Record<string, string> = { OCCUPIED: "bg-emerald-100 text-emerald-700", AVAILABLE: "bg-sky-100 text-sky-700", MAINTENANCE: "bg-amber-100 text-amber-700" };
const LEDGER_STYLE = { PAID: "bg-emerald-100 text-emerald-700", PARTIAL: "bg-amber-100 text-amber-700", DUE: "bg-orange-100 text-orange-700", OVERDUE: "bg-red-100 text-red-700" } as const;
const human = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className={h}>{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

/** Loads one record; skeleton, error with Try again, "no longer available", or the data. */
function useRecord<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let live = true;
    setState("loading");
    authApi<T>(path).then((r) => { if (live) { setData(r); setState("ready"); } }).catch((e) => { if (live) setState(e instanceof ApiError && e.code === "NOT_FOUND" ? "gone" : "error"); });
    return () => { live = false; };
  }, [path, tick]);
  return { data, state, retry: () => setTick((n) => n + 1) };
}

interface FrameProps { open: boolean; title: string; labelledBy: string; state: "loading" | "ready" | "error" | "gone"; retry: () => void; canGoBack: boolean; onClose: () => void; children: React.ReactNode }

function Frame({ open, title, labelledBy, state, retry, canGoBack, onClose, children }: FrameProps) {
  const t = useTranslations("admin.findPeople.detail");
  return (
    <Modal open={open} onClose={onClose} labelledBy={labelledBy} maxWidth="max-w-[850px]">
      {open && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {(state === "error" || state === "gone") && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{state === "gone" ? t("gone") : t("error")}</p>
              {state === "error" && <button type="button" onClick={retry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>}</div>
          )}
          {state === "ready" && <div className="mt-4 space-y-4">{children}</div>}
          <div className="mt-5 flex justify-end border-t border-slate-200/70 pt-4">
            <button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{canGoBack ? <><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</> : t("close")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** The owner / seller / landlord with a link to the full profile. */
function PersonBlock({ label, p }: { label: string; p: PersonRef }) {
  const t = useTranslations("admin.findPeople.detail");
  return (
    <section className={card}>
      <h3 className={clsx(h, "flex items-center gap-1.5")}><UserRound className="size-3.5" aria-hidden />{label}</h3>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-bold text-navy">{p.fullName}{p.ownerCode && <span className="ml-2 text-xs font-semibold text-[#0A84F0]">{t("id", { code: p.ownerCode })}</span>}</p>
          <p className="break-all text-xs text-slate-600">{p.email ?? "—"}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-600"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(p.phone)}</span></p>
        </div>
        <Open to={{ kind: "person", id: p.id }} label={t("openPerson", { name: p.fullName })} className="btn btn-white h-10 px-4 text-sm">{t("viewProfile")}</Open>
      </div>
    </section>
  );
}

function Photos({ urls }: { urls: string[] }) {
  const t = useTranslations("admin.findPeople.detail");
  if (urls.length === 0) return <div className="grid h-24 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500"><span className="inline-flex items-center gap-2"><ImageOff className="size-4" aria-hidden />{t("noPhotos")}</span></div>;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt={t("photo", { n: i + 1 })} className="h-36 w-56 shrink-0 rounded-xl border border-white object-cover shadow-sm" />
      ))}
    </div>
  );
}

interface ModalProps { id: string | null; canGoBack: boolean; onClose: () => void }

/** A property: photos, details, owner, occupancy, amenities and every unit (each opens the unit window). */
export function PropertyModal({ id, canGoBack, onClose }: ModalProps) {
  const t = useTranslations("admin.findPeople.detail");
  const tp = useTranslations("admin.properties");
  const locale = useLocale();
  const { data: d, state, retry } = useRecord<PropertyFull>(id ? `/admin/find-people/properties/${id}` : null);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const money = formatTaka(locale);
  return (
    <Frame open={!!id} title={d?.name ?? t("property")} labelledBy="fp-prop" state={state} retry={retry} canGoBack={canGoBack} onClose={onClose}>
      {d && (
        <>
          <Photos urls={d.photos} />
          <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
            <Fact label={t("type")}>{human(d.type)}</Fact>
            <Fact label={t("state")}><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", d.archived ? "bg-slate-200 text-slate-600" : d.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{d.archived ? t("archived") : human(d.status)}</span> <span className="text-xs font-medium text-slate-500">{t(`verify.${d.verificationStatus}` as never)}</span></Fact>
            <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.location || t("none")}</span></Fact>
            <Fact label={t("floors")}>{num(d.totalFloors)}{d.totalSqft ? ` · ${t("sqft", { n: num(d.totalSqft) })}` : ""}</Fact>
            <Fact label={t("added")}>{day(locale, d.createdAt)}</Fact>
            {d.archiveReason && <Fact label={t("archiveReason")}>{d.archiveReason}</Fact>}
            {d.description && <div className="sm:col-span-2"><Fact label={t("description")}><span className="whitespace-pre-line">{d.description}</span></Fact></div>}
          </dl>
          <PersonBlock label={t("owner")} p={d.owner} />
          <section className={card}>
            <h3 className={h}>{t("occupancy")}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([[t("units"), d.totals.units, "text-navy"], [t("occupied"), d.totals.occupied, "text-emerald-700"], [t("vacant"), d.totals.vacant, "text-sky-700"], [t("repair"), d.totals.repair, "text-amber-700"]] as [string, number, string][]).map(([label, n, tone]) => <div key={label} className="rounded-lg bg-white/70 p-2.5 text-center"><p className={clsx("text-2xl font-bold", tone)}>{num(n)}</p><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>)}
            </div>
          </section>
          <section className={card}>
            <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("unitList")} · {num(d.units.length)}</h3>
            {d.units.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noUnits")}</p> : (
              <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {d.units.map((u) => (
                  <li key={u.id}>
                    <Open to={{ kind: "unit", id: u.id }} label={t("openUnit", { unit: u.unitNumber })} className="flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy">{t("unitName", { unit: u.unitNumber })} <span className="text-xs font-medium text-slate-500">· {t("floorN", { n: num(u.floor) })} · {t("beds", { n: num(u.bedrooms) })}{u.areaSqft ? ` · ${t("sqft", { n: num(u.areaSqft) })}` : ""}</span></span><span className="block truncate text-xs text-slate-500">{u.tenant ? u.tenant.name : t("noTenant")}</span></span>
                      <span className="shrink-0 text-right"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", AVAIL_STYLE[u.availability] ?? "bg-slate-200 text-slate-600")}>{t(`avail.${u.availability}` as never)}</span><span className="mt-0.5 block text-xs font-semibold text-navy">{money(Number(u.rent))}</span></span>
                    </Open>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={card} aria-label={t("amenities")}>
            <h3 className={h}>{t("amenities")}</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {AMENITY_CODES.map((a) => {
                const has = d.amenities.includes(a);
                return <li key={a} className={clsx("flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm", has ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-slate-200 bg-slate-50/70 text-slate-500")}><span aria-hidden className={clsx("grid size-5 place-items-center rounded-full text-white", has ? "bg-emerald-500" : "bg-slate-300")}>{has ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>{tp(`amenity.${a}` as never)}</li>;
              })}
            </ul>
          </section>
        </>
      )}
    </Frame>
  );
}

/** A marketplace listing: photos, price, specs, full description, seller and the property it belongs to. */
export function ListingModal({ id, canGoBack, onClose }: ModalProps) {
  const t = useTranslations("admin.findPeople.detail");
  const locale = useLocale();
  const { data: d, state, retry } = useRecord<ListingFull>(id ? `/admin/find-people/listings/${id}` : null);
  const num = (n: number | string) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(Number(n));
  return (
    <Frame open={!!id} title={d?.title ?? t("listing")} labelledBy="fp-listing" state={state} retry={retry} canGoBack={canGoBack} onClose={onClose}>
      {d && (
        <>
          <Photos urls={d.photos} />
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", d.status === "SOLD" || d.status === "RENTED" ? "bg-slate-200 text-slate-700" : d.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{human(d.status)}</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-700">{t(d.type === "SALE" ? "forSale" : "forRent")}</span>
            {d.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"><Star className="size-3" aria-hidden />{t("featured")}</span>}
            <span className="text-xl font-bold text-navy">{formatTaka(locale)(Number(d.price))}</span>{d.negotiable && <span className="text-xs text-slate-500">{t("negotiable")}</span>}
          </div>
          <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-3")}>
            <Fact label={t("category")}>{human(d.category)}</Fact>
            <Fact label={t("rooms")}><span className="inline-flex items-center gap-2"><BedDouble className="size-4 text-[#0A84F0]" aria-hidden />{d.bedrooms ?? "—"} <Bath className="size-4 text-[#0A84F0]" aria-hidden />{d.bathrooms ?? "—"}</span></Fact>
            <Fact label={t("area")}><span className="inline-flex items-center gap-1"><Ruler className="size-4 text-[#0A84F0]" aria-hidden />{d.area ? `${num(d.area)} ${d.areaUnit ?? ""}` : "—"}</span></Fact>
            <Fact label={t("floorOf")}>{d.floor != null ? `${num(d.floor)}${d.totalFloors ? ` / ${num(d.totalFloors)}` : ""}` : "—"}</Fact>
            <Fact label={t("posted")}>{day(locale, d.createdAt)}</Fact>
            <Fact label={t("updated")}>{day(locale, d.updatedAt)}</Fact>
            <div className="sm:col-span-3"><Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.location || t("none")}</span></Fact></div>
            {d.property && <div className="sm:col-span-3"><Fact label={t("property")}><OpenText to={{ kind: "property", id: d.property.id }} label={t("openProperty", { name: d.property.name })}>{d.property.name}</OpenText></Fact></div>}
          </dl>
          <section className={card}><h3 className={h}>{t("description")}</h3><p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{d.description}</p></section>
          <PersonBlock label={t("seller")} p={d.seller} />
        </>
      )}
    </Frame>
  );
}

/** One unit: specs, the tenant and the lease, the latest rent months, repair tickets, the property and the owner. */
export function UnitModal({ id, canGoBack, onClose }: ModalProps) {
  const t = useTranslations("admin.findPeople.detail");
  const locale = useLocale();
  const { data: d, state, retry } = useRecord<UnitFull>(id ? `/admin/find-people/units/${id}` : null);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const money = formatTaka(locale);
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
  return (
    <Frame open={!!id} title={d ? t("unitTitle", { unit: d.unitNumber, property: d.property.name }) : t("unit")} labelledBy="fp-unit" state={state} retry={retry} canGoBack={canGoBack} onClose={onClose}>
      {d && (
        <>
          <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-3")}>
            <Fact label={t("state")}><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", AVAIL_STYLE[d.availability] ?? "bg-slate-200 text-slate-600")}>{t(`avail.${d.availability}` as never)}</span></Fact>
            <Fact label={t("floor")}>{num(d.floor)}</Fact>
            <Fact label={t("furnishing")}>{human(d.furnishing)}</Fact>
            <Fact label={t("rooms")}><span className="inline-flex flex-wrap items-center gap-x-3">{t("beds", { n: num(d.bedrooms) })} · {t("baths", { n: num(d.bathrooms) })} · {t("dining", { n: num(d.diningRooms) })} · {t("kitchens", { n: num(d.kitchens) })}</span></Fact>
            <Fact label={t("area")}>{d.areaSqft ? t("sqft", { n: num(d.areaSqft) }) : "—"}</Fact>
            <Fact label={t("rent")}>{money(Number(d.rent))}</Fact>
            <Fact label={t("deposit")}>{money(Number(d.deposit))}</Fact>
            <Fact label={t("utility")}>{money(Number(d.utilityCharge))}</Fact>
            <Fact label={t("tickets")}>{t("ticketsValue", { open: num(d.tickets.open), total: num(d.tickets.total) })}</Fact>
            {d.description && <div className="sm:col-span-3"><Fact label={t("description")}><span className="whitespace-pre-line">{d.description}</span></Fact></div>}
          </dl>
          <section className={card}>
            <h3 className={clsx(h, "flex items-center gap-1.5")}><Building2 className="size-3.5" aria-hidden />{t("property")}</h3>
            <p className="mt-1 text-sm"><OpenText to={{ kind: "property", id: d.property.id }} label={t("openProperty", { name: d.property.name })}>{d.property.name}</OpenText><span className="text-slate-500"> · {d.property.location || t("none")}</span></p>
          </section>
          <section className={card}>
            <h3 className={clsx(h, "flex items-center gap-1.5")}><UserRound className="size-3.5" aria-hidden />{t("tenant")}</h3>
            {d.tenant && d.lease ? (
              <div className="mt-1 space-y-2">
                <p className="text-sm font-bold text-navy"><OpenText to={{ kind: "person", id: d.tenant.id }} label={t("openPerson", { name: d.tenant.fullName })}>{d.tenant.fullName}</OpenText>{d.tenant.tenantCode && <span className="ml-2 text-xs font-semibold text-[#0A84F0]">{t("id", { code: d.tenant.tenantCode })}</span>}</p>
                <p className="text-xs text-slate-600"><span className="break-all">{d.tenant.email ?? "—"}</span> · <span dir="ltr">{formatPhone(d.tenant.phone)}</span></p>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-4">
                  <Fact label={t("leaseStart")}>{day(locale, d.lease.startDate)}</Fact>
                  <Fact label={t("leaseEnd")}>{d.lease.endDate ? day(locale, d.lease.endDate) : t("open")}{d.lease.noticeGiven && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-bold text-amber-700">{t("notice")}</span>}</Fact>
                  <Fact label={t("leaseRent")}>{money(Number(d.lease.rent))}</Fact>
                  <Fact label={t("members")}>{num(d.lease.members)}</Fact>
                </dl>
              </div>
            ) : <p className="mt-1 text-sm text-slate-600">{t("vacantNow")}</p>}
            <p className="mt-2 text-xs text-slate-500">{t("previous", { n: num(d.previousTenancies) })}</p>
          </section>
          {d.ledger.length > 0 && (
            <section className={card}>
              <h3 className={clsx(h, "flex items-center gap-1.5")}><ReceiptText className="size-3.5" aria-hidden />{t("ledger")}</h3>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-white/70">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white/95"><tr className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">{t("col.month")}</th><th className="px-3 py-2">{t("col.total")}</th><th className="px-3 py-2">{t("col.paid")}</th><th className="px-3 py-2">{t("col.status")}</th></tr></thead>
                  <tbody>{d.ledger.map((l) => <tr key={l.id} className="border-t border-slate-200/60"><td className="px-3 py-1.5 font-semibold text-navy">{month(l.month)}</td><td className="px-3 py-1.5">{money(Number(l.total))}</td><td className="px-3 py-1.5">{money(Number(l.paid))}</td><td className="px-3 py-1.5"><span className={clsx("rounded-full px-2 py-0.5 font-bold", LEDGER_STYLE[l.status])}>{t(`ledgerStatus.${l.status}`)}</span></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          <PersonBlock label={t("owner")} p={d.owner} />
        </>
      )}
    </Frame>
  );
}
