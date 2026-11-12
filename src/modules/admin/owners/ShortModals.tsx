"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BedDouble, Bath, Building2, ImageOff, MapPin, RefreshCw, Ruler, Star } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import type { ListingShort, PropertyShort } from "./types";

/** Loads one small record; shows a skeleton, an error with Try again, or the data. */
function useShort<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let live = true;
    setState("loading");
    authApi<T>(path).then((r) => { if (live) { setData(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [path, tick]);
  return { data, state, retry: () => setTick((n) => n + 1) };
}

function Shell({ open, onClose, labelledBy, title, state, retry, children }: { open: boolean; onClose: () => void; labelledBy: string; title: string; state: "loading" | "ready" | "error"; retry: () => void; children: React.ReactNode }) {
  const t = useTranslations("admin.owners.short");
  return (
    <Modal open={open} onClose={onClose} labelledBy={labelledBy} maxWidth="max-w-[560px]">
      {open && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-4 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /></div>}
          {state === "error" && <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p><button type="button" onClick={retry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>}
          {state === "ready" && <div className="mt-4">{children}</div>}
          <div className="mt-5 flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-11 sm:min-w-28">{t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

const human = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");

/** Short information about one property / apartment: where it is, how full it is, and every unit with its tenant. */
export function PropertyShortModal({ ownerId, id, onClose }: { ownerId: string; id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.owners.short");
  const locale = useLocale();
  const { data: d, state, retry } = useShort<PropertyShort>(id ? `/admin/active-owners/${ownerId}/property/${id}` : null);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  return (
    <Shell open={!!id} onClose={onClose} labelledBy="ow-prop" title={d?.name ?? t("property")} state={state} retry={retry}>
      {d && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-slate-600"><Building2 className="mt-0.5 size-4 shrink-0 text-[#0A84F0]" aria-hidden />{human(d.type)}{d.location ? <><span aria-hidden> · </span><MapPin className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />{d.location}</> : null}</p>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 sm:grid-cols-4">
            <Fact label={t("floors")}>{num(d.totalFloors)}</Fact><Fact label={t("units")}>{num(d.totals.units)}</Fact>
            <Fact label={t("occupied")}><span className="text-emerald-600">{num(d.totals.occupied)}</span></Fact><Fact label={t("vacant")}><span className="text-amber-600">{num(d.totals.vacant)}</span></Fact>
          </dl>
          <p className="text-xs text-slate-500">{t("added", { date: day(locale, d.createdAt) })}</p>
          {d.units.length === 0 ? <p className="text-sm text-slate-500">{t("noUnits")}</p> : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto" aria-label={t("units")}>
              {d.units.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
                  <span className="min-w-0"><b className="text-navy">{t("unit", { n: u.unitNumber })}</b> <span className="text-xs text-slate-500">· {t("floorN", { n: num(u.floor) })} · {t("bedBath", { bed: num(u.bedrooms), bath: num(u.bathrooms) })}{u.areaSqft ? ` · ${num(u.areaSqft)} ${t("sqft")}` : ""}</span>{u.tenant && <span className="block truncate text-xs text-slate-600">{u.tenant}</span>}</span>
                  <span className="shrink-0 text-right"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", u.availability === "OCCUPIED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{t(u.availability === "OCCUPIED" ? "occupiedShort" : "vacantShort")}</span><span className="block text-xs text-slate-500">{formatTaka(locale)(Number(u.rent))}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Shell>
  );
}

/** Short information about one marketplace listing (for sale or sold). */
export function ListingShortModal({ ownerId, id, onClose }: { ownerId: string; id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.owners.short");
  const locale = useLocale();
  const { data: d, state, retry } = useShort<ListingShort>(id ? `/admin/active-owners/${ownerId}/listing/${id}` : null);
  const num = (n: number | string) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(Number(n));
  return (
    <Shell open={!!id} onClose={onClose} labelledBy="ow-listing" title={d?.title ?? t("listing")} state={state} retry={retry}>
      {d && (
        <div className="space-y-3">
          {d.photoUrl ? <img src={d.photoUrl} alt="" className="max-h-48 w-full rounded-xl border border-white object-cover shadow-sm" /> : <div className="grid h-24 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"><ImageOff className="size-6" aria-hidden /></div>}
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", d.status === "SOLD" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700")}>{t(d.status === "SOLD" ? "sold" : "forSale")}</span>
            {d.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"><Star className="size-3" aria-hidden />{t("featured")}</span>}
            <span className="text-lg font-bold text-navy">{formatTaka(locale)(Number(d.price))}</span>{d.negotiable && <span className="text-xs text-slate-500">{t("negotiable")}</span>}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 sm:grid-cols-3">
            <Fact label={t("category")}>{human(d.category)}</Fact>
            <Fact label={t("rooms")}><span className="inline-flex items-center gap-2"><BedDouble className="size-4 text-[#0A84F0]" aria-hidden />{d.bedrooms ?? "—"} <Bath className="size-4 text-[#0A84F0]" aria-hidden />{d.bathrooms ?? "—"}</span></Fact>
            <Fact label={t("area")}><span className="inline-flex items-center gap-1"><Ruler className="size-4 text-[#0A84F0]" aria-hidden />{d.area ? `${num(d.area)} ${d.areaUnit && d.areaUnit.toLowerCase() !== "sqft" ? d.areaUnit : t("sqft")}` : "—"}</span></Fact>
            <Fact label={t("floorOf")}>{d.floor != null ? `${num(d.floor)}${d.totalFloors ? ` / ${num(d.totalFloors)}` : ""}` : "—"}</Fact>
            <Fact label={t("posted")}>{day(locale, d.createdAt)}</Fact>
            <Fact label={t("updated")}>{day(locale, d.updatedAt)}</Fact>
          </dl>
          {d.location && <p className="flex items-start gap-2 text-sm text-slate-600"><MapPin className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />{d.location}</p>}
          <p className="whitespace-pre-line break-words text-sm text-slate-700">{d.description}</p>
        </div>
      )}
    </Shell>
  );
}
