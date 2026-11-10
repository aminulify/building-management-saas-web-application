"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, ShieldCheck, ShieldAlert, Route, Trees, AlertTriangle, Bath, BadgeCheck, BedDouble, CalendarClock, Check, ExternalLink, Heart, Layers, Loader2, MapPin, MessageCircle, Phone, RefreshCw, Ruler, Share2, Sofa, Sun, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatNumber, formatTaka, timeAgo } from "../owner/dashboard/format";
import { Gallery } from "./Gallery";
import { MessageOwner } from "./MessageOwner";
import { ScheduleVisit } from "./ScheduleVisit";
import { mapEmbed, mapOpen } from "./share";
import type { HomeDetails, VisitRow } from "./types";

interface Props {
  id: string | null;
  onClose: () => void;
  onToggleSave: (id: string, now: boolean) => Promise<boolean>;
  onShare: (id: string, title: string) => void;
  /** Marketplace: wider (900 px), shows the owner's phone/e-mail and NID clearance, and has a Close button */
  market?: boolean;
}

type Panel = null | "message" | "visit";

export function DetailsModal({ id, onClose, onToggleSave, onShare, market = false }: Props) {
  return <Modal open={!!id} onClose={onClose} labelledBy="fh-details-title" maxWidth={market ? "max-w-[900px]" : "max-w-[780px]"}>{id && <Body id={id} onToggleSave={onToggleSave} onShare={onShare} market={market} onClose={onClose} />}</Modal>;
}

function Body({ id, onToggleSave, onShare, market, onClose }: { id: string; onToggleSave: Props["onToggleSave"]; onShare: Props["onShare"]; market: boolean; onClose: () => void }) {
  const mk = useTranslations("owner.marketplace.details");
  const t = useTranslations("owner.findHome");
  const d = useTranslations("owner.findHome.details");
  const locale = useLocale();
  const toast = useToast();
  const n = formatNumber(locale);
  const taka = formatTaka(locale);
  const [home, setHome] = useState<HomeDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [visit, setVisit] = useState<VisitRow | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [calling, setCalling] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [contact, setContact] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [fav, setFav] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    setState("loading");
    authApi<HomeDetails>(`/listings/${id}`)
      .then((h) => { if (off) return; setHome(h); setFav(h.isFavorite); setState("ready"); })
      .catch((e) => { if (!off) setState(e instanceof ApiError && e.status === 404 ? "gone" : "error"); });
    // a view is counted once per minute per visitor on the server
    authApi(`/listings/${id}/view`, { method: "POST" }).catch(() => undefined);
    return () => { off = true; };
  }, [id, tick]);

  const loadVisit = useCallback(() => {
    authApi<VisitRow[]>("/me/visits").then((rows) => setVisit(rows.find((v) => v.listing.id === id && (v.status === "PENDING" || v.status === "CONFIRMED")) ?? null)).catch(() => undefined);
  }, [id]);
  useEffect(() => { loadVisit(); }, [loadVisit]);

  async function call() {
    setCalling(true);
    try {
      const c = await authApi<{ name: string; phone: string | null }>(`/listings/${id}/contact`);
      if (!c.phone) { toast("error", d("noPhone")); return; }
      setPhone(c.phone);
      window.location.href = `tel:${c.phone}`;
    } catch (e) { toast("error", e instanceof ApiError && e.status === 429 ? d("callLimit") : d("callError")); } finally { setCalling(false); }
  }

  async function showContact() {
    setRevealing(true);
    try { setContact(await authApi<{ name: string; phone: string | null; email: string | null }>(`/listings/${id}/contact`)); }
    catch (e) { toast("error", e instanceof ApiError && e.status === 429 ? d("callLimit") : d("callError")); } finally { setRevealing(false); }
  }

  async function save() {
    const next = !fav;
    setFav(next);
    if (!(await onToggleSave(id, next))) setFav(!next); // the server said no: show the real state again
  }

  if (state === "loading") return (
    <div aria-busy="true" className="space-y-4 pt-6"><span id="fh-details-title" className="sr-only">{d("loading")}</span>
      <div className="skeleton aspect-[16/9] w-full rounded-xl" /><div className="skeleton h-7 w-2/3 rounded-lg" /><div className="skeleton h-24 w-full rounded-xl" /></div>
  );
  if (state !== "ready" || !home) return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <AlertTriangle className="size-9 text-red-500" aria-hidden />
      <h2 id="fh-details-title" className="text-lg font-bold text-navy">{state === "gone" ? d("goneTitle") : d("errorTitle")}</h2>
      <p className="max-w-sm text-sm text-slate-600">{state === "gone" ? d("goneText") : d("errorText")}</p>
      {state === "error" && <button type="button" onClick={() => setTick((v) => v + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("states.retry")}</button>}
    </div>
  );

  const h = home;
  const specs = [
    h.bedrooms !== null && { icon: BedDouble, k: d("bedrooms"), v: n(h.bedrooms) },
    h.bathrooms !== null && { icon: Bath, k: d("bathrooms"), v: n(h.bathrooms) },
    h.area !== null && { icon: Ruler, k: d("area"), v: `${n(Number(h.area))} ${t(`card.unit.${h.areaUnit ?? "SQFT"}`)}` },
    h.landDetails?.landType && { icon: Trees, k: d("landType"), v: d(`landTypes.${h.landDetails.landType}`) },
    h.landDetails?.roadWidthFt && { icon: Route, k: d("roadWidth"), v: d("feet", { n: n(h.landDetails.roadWidthFt) }) },
    h.condition && d.has(`conditions.${h.condition}`) && { icon: Layers, k: d("condition"), v: d(`conditions.${h.condition}`) },
    h.floor !== null && { icon: Layers, k: d("floor"), v: h.totalFloors ? d("floorOf", { f: n(h.floor), t: n(h.totalFloors) }) : n(h.floor) },
    h.balconies !== null && { icon: Sun, k: d("balconies"), v: n(h.balconies) },
    h.furnishing && { icon: Sofa, k: d("furnishing"), v: t(`filters.furnishing.${h.furnishing}`) },
  ].filter(Boolean) as { icon: typeof Ruler; k: string; v: string }[];
  const hasMap = h.lat !== null && h.lng !== null;
  const seller = h.seller;
  const initials = seller.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="pt-1">
      <div className="mb-4 pr-10">
        <p className="mb-1 text-xs font-semibold text-label">{t(`category.${h.category}`)} · {timeAgo(locale, h.createdAt)}</p>
        <h2 id="fh-details-title" className="text-xl font-bold leading-snug text-navy sm:text-2xl">{h.title}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="size-4 shrink-0 text-pink-500" aria-hidden />{h.locationLabel}</p>
      </div>

      <Gallery photos={h.photoUrls} alt={h.title} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-wider text-label">{h.type === "RENT" ? t("card.perMonth") : t("card.salePrice")}</p>
          <p className="text-3xl font-extrabold text-[#0A84F0]">{taka(Number(h.price))}{h.negotiable && <span className="ml-2 align-middle text-xs font-semibold text-emerald-600">{d("negotiable")}</span>}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onShare(id, h.title)} className="btn btn-white h-10 px-4 text-sm"><Share2 className="size-4" aria-hidden />{t("card.share")}</button>
          <button type="button" onClick={save} aria-pressed={fav} className={clsx("btn btn-white h-10 px-4 text-sm", fav && "!text-pink-500")}><Heart className={clsx("size-4", fav && "fill-current")} aria-hidden />{fav ? t("card.unsave") : t("card.save")}</button>
        </div>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-bold text-navy">{d("specs")}</h3>
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {specs.map((s) => (
          <div key={s.k} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-white text-[#0A84F0] shadow-sm"><s.icon className="size-[1.1rem]" /></span>
            <div className="min-w-0"><dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-label">{s.k}</dt><dd className="truncate text-sm font-bold text-navy">{s.v}</dd></div>
          </div>
        ))}
      </dl>

      {h.description && <><h3 className="mb-1.5 mt-5 text-sm font-bold text-navy">{d("about")}</h3><p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{h.description}</p></>}

      {(h.amenities.length > 0 || h.distances.length > 0) && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {h.amenities.length > 0 && (
            <div><h3 className="mb-2 text-sm font-bold text-navy">{d("amenities")}</h3>
              <ul className="flex flex-wrap gap-1.5">{h.amenities.map((a) => <li key={a} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"><Check className="size-3" aria-hidden />{d.has(`amenity.${a}`) ? d(`amenity.${a}`) : a}</li>)}</ul></div>
          )}
          {h.distances.length > 0 && (
            <div><h3 className="mb-2 text-sm font-bold text-navy">{d("nearby")}</h3>
              <ul className="space-y-1 text-sm text-slate-700">{[...h.distances].sort((a, b) => a.distanceM - b.distanceM).map((x) => <li key={x.facilityType} className="flex justify-between gap-3"><span>{t(`filters.nearby.${x.facilityType}`)}</span><span className="font-semibold text-navy">{x.distanceM < 1000 ? d("meters", { n: n(x.distanceM) }) : d("km", { n: (x.distanceM / 1000).toLocaleString(locale === "bn" ? "bn-BD" : "en-US", { maximumFractionDigits: 1 }) })}</span></li>)}</ul></div>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-sm font-bold text-navy">{d("location")}</h3>
      <p className="mb-2 text-sm text-slate-700">{h.fullAddress ?? h.locationLabel}</p>
      {hasMap ? (
        <>
          <iframe title={d("mapTitle", { title: h.title })} src={mapEmbed(h.lat!, h.lng!)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-56 w-full rounded-xl border border-slate-200 sm:h-64" />
          <a href={mapOpen(h.lat!, h.lng!)} target="_blank" rel="noopener noreferrer" className="btn btn-white mt-2 h-10 px-4 text-sm"><ExternalLink className="size-4" aria-hidden />{d("openMap")}</a>
        </>
      ) : <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-label">{d("noMap")}</p>}

      <h3 className="mb-2 mt-5 text-sm font-bold text-navy">{d("owner")}</h3>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white/70 p-4">
        {seller.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          ? <img src={seller.avatarUrl} alt="" className="size-14 rounded-full object-cover ring-2 ring-white" />
          : <span aria-hidden className="grid size-14 place-items-center rounded-full bg-brand-gradient text-lg font-bold text-white">{initials || <UserRound className="size-6" />}</span>}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-bold text-navy">{seller.fullName}{seller.verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-bold text-emerald-700"><BadgeCheck className="size-3.5" aria-hidden />{d("verified")}</span>}</p>
          {seller.ownerCode && <p className="text-xs text-label">{d("ownerId", { code: seller.ownerCode })}</p>}
          {phone && <p className="mt-0.5 text-sm font-semibold text-[#0A84F0]"><a href={`tel:${phone}`} dir="ltr">{phone}</a></p>}
        </div>
      </div>

      {market && (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{mk("nid")}</p>
            <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${seller.nidStatus === "VERIFIED" ? "text-emerald-600" : seller.nidStatus === "PENDING" ? "text-amber-600" : "text-slate-500"}`}>
              {seller.nidStatus === "VERIFIED" ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldAlert className="size-4" aria-hidden />}{mk(`nidStatus.${seller.nidStatus}`)}
            </p>
          </div>
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{mk("contact")}</p>
            {contact ? (
              <div className="mt-1 space-y-1 text-sm">
                {contact.phone && <p className="flex items-center gap-1.5"><Phone className="size-4 text-[#0A84F0]" aria-hidden /><a href={`tel:${contact.phone}`} dir="ltr" className="font-semibold text-navy hover:underline">{contact.phone}</a></p>}
                {contact.email && <p className="flex items-center gap-1.5"><Mail className="size-4 text-[#0A84F0]" aria-hidden /><a href={`mailto:${contact.email}`} className="break-all font-semibold text-navy hover:underline">{contact.email}</a></p>}
              </div>
            ) : h.isOwn ? <p className="mt-1 text-sm text-slate-500">–</p> : (
              <button type="button" onClick={showContact} disabled={revealing} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0A84F0] hover:underline disabled:opacity-60">{revealing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Phone className="size-4" aria-hidden />}{mk("showContact")}</button>
            )}
          </div>
        </div>
      )}

      {h.isOwn ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">{d("ownListing")}</p> : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <button type="button" onClick={call} disabled={calling} className="btn btn-primary h-11 text-sm">{calling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Phone className="size-4" aria-hidden />}{d("call")}</button>
            <button type="button" onClick={() => setPanel(panel === "message" ? null : "message")} aria-expanded={panel === "message"} className="btn btn-primary h-11 text-sm"><MessageCircle className="size-4" aria-hidden />{d("message")}</button>
            <button type="button" onClick={() => setPanel(panel === "visit" ? null : "visit")} aria-expanded={panel === "visit"} className="btn btn-primary h-11 text-sm"><CalendarClock className="size-4" aria-hidden />{d("schedule")}</button>
          </div>
          {visit && panel !== "visit" && <ScheduleVisit listingId={id} existing={visit} onChanged={loadVisit} />}
          {panel === "message" && <MessageOwner listingId={id} title={h.title} onSent={() => setPanel(null)} />}
          {panel === "visit" && <ScheduleVisit listingId={id} existing={visit} onChanged={() => { loadVisit(); setPanel(null); }} />}
        </div>
      )}
      {market && <div className="mt-5 flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="btn btn-white h-11 px-8 text-sm">{mk("close")}</button></div>}
    </div>
  );
}
