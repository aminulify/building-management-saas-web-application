"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, FilterX, GraduationCap, Landmark, ParkingCircle, Route, School, Search, ShieldCheck, SlidersHorizontal, Trees, X, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useArea } from "../find-home/area";
import { GeoSelect } from "../find-home/FilterCard";
import { EMPTY_FILTERS, activeCount, cleanAmount, priceRangeInvalid, toggle } from "../find-home/filters";
import type { AmenityKey, CategoryChoice, Filters, LandType } from "../find-home/types";
import { useZones } from "./use-zones";

interface Props { filters: Filters; onChange: (patch: Partial<Filters>) => void }

const label = "mb-1.5 block text-[0.68rem] font-bold uppercase tracking-wider text-label";
const shell = "glass-input relative flex h-11 items-center rounded-lg pl-3 pr-9";

const CATEGORIES: { value: CategoryChoice; key: string }[] = [
  { value: "", key: "all" }, { value: "APARTMENT", key: "flat" }, { value: "LAND", key: "land" }, { value: "COMMERCIAL", key: "commercial" }, { value: "BUILDING", key: "building" },
];
const AMENITIES: { key: AmenityKey; icon: LucideIcon }[] = [
  { key: "SECURITY", icon: ShieldCheck }, { key: "PARKING", icon: ParkingCircle }, { key: "MOSQUE", icon: Landmark }, { key: "SCHOOL", icon: School },
  { key: "UNIVERSITY", icon: GraduationCap }, { key: "HIGHWAY", icon: Route }, { key: "PARK", icon: Trees },
];
const LAND_TYPES: Exclude<LandType, "">[] = ["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL"];

/** The Marketplace search bar: text, Buy/Rent, category, zone, price, amenity checkboxes, and a "more" panel for place and details. */
export function MarketToolbar({ filters: f, onChange }: Props) {
  const t = useTranslations("owner.marketplace.toolbar");
  const fh = useTranslations("owner.findHome");
  const locale = useLocale();
  const area = useArea();
  const { zones } = useZones();
  const [more, setMore] = useState(false);
  const bad = priceRangeInvalid(f);
  const count = activeCount(f);
  const isLand = f.category === "LAND";
  const placeOn = !!f.division;

  // filters set by the AI assistant that have no control on the bar are shown as removable chips
  const chips: { key: string; text: string; remove: () => void }[] = [
    ...f.beds.map((b) => ({ key: `b${b}`, text: fh("filters.bedN", { n: b }), remove: () => onChange({ beds: f.beds.filter((x) => x !== b) }) })),
    ...f.nearby.map((k) => ({ key: `n${k}`, text: fh(`filters.nearby.${k}`), remove: () => onChange({ nearby: f.nearby.filter((x) => x !== k) }) })),
    ...(f.furnishing ? [{ key: "furn", text: fh(`filters.furnishing.${f.furnishing}`), remove: () => onChange({ furnishing: "" as const }) }] : []),
    ...(f.landType ? [{ key: "land", text: fh(`details.landTypes.${f.landType}`), remove: () => onChange({ landType: "" as const }) }] : []),
    ...(f.amenities.filter((a) => !AMENITIES.some((x) => x.key === a)).map((a) => ({ key: `a${a}`, text: fh(`filters.amenity.${a}`), remove: () => onChange({ amenities: f.amenities.filter((x) => x !== a) }) }))),
  ];

  return (
    <section aria-label={t("aria")} className="space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_auto]">
        <div className="glass-input flex h-12 items-center gap-2.5 rounded-xl px-3.5">
          <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
          <label htmlFor="mk-search" className="sr-only">{t("searchLabel")}</label>
          <input id="mk-search" type="search" value={f.q} maxLength={80} autoComplete="off" onChange={(e) => onChange({ q: e.target.value })} placeholder={t("searchPlaceholder")}
            className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
          {f.q && <button type="button" onClick={() => onChange({ q: "" })} aria-label={t("clearSearch")} className="rounded p-1 text-slate-400 hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </div>
        <div role="group" aria-label={t("modeLabel")} className="inline-flex h-12 items-center rounded-xl border border-white/70 bg-white/70 p-1 backdrop-blur-md">
          <span aria-current="page" className="inline-flex h-10 items-center rounded-lg bg-brand-gradient px-5 text-sm font-semibold text-white shadow-sm">{t("modes.SALE")}</span>
          {/* renting lives on the Find Home page */}
          <Link href={`${area}/find-home` as never} className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold text-slate-600 transition-all duration-300 hover:bg-white hover:text-navy">{t("modes.RENT")}</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label htmlFor="mk-f-cat" className={label}>{t("category")}</label>
          <div className={shell}>
            <select id="mk-f-cat" value={CATEGORIES.some((c) => c.value === f.category) ? f.category : ""} onChange={(e) => onChange({ category: e.target.value as CategoryChoice, landType: "", beds: e.target.value === "LAND" ? [] : f.beds })} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
              {CATEGORIES.map((c) => <option key={c.key} value={c.value}>{t(`categories.${c.key}`)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
          </div>
        </div>
        <div>
          <label htmlFor="mk-f-zone" className={label}>{t("zone")}</label>
          <div className={shell}>
            <select id="mk-f-zone" value={f.zoneId} onChange={(e) => onChange({ zoneId: e.target.value })} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
              <option value="">{t("allZones")}</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{locale === "bn" ? z.nameBn : z.nameEn}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
          </div>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <span className={label} id="mk-price-label">{t("price")}</span>
          <div role="group" aria-labelledby="mk-price-label" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            {(["minPrice", "maxPrice"] as const).map((k, i) => (
              <div key={k} className="contents">
                {i === 1 && <span aria-hidden className="text-slate-400">–</span>}
                <div className="glass-input flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-3" data-invalid={bad || undefined}>
                  <span aria-hidden className="text-sm font-semibold text-slate-400">৳</span>
                  <input inputMode="numeric" autoComplete="off" value={f[k] ? Number(f[k]).toLocaleString("en-US") : ""} placeholder={t(i === 0 ? "min" : "max")} aria-label={t(i === 0 ? "min" : "max")} aria-invalid={bad || undefined}
                    onChange={(e) => onChange({ [k]: cleanAmount(e.target.value) })} className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-navy outline-none placeholder:text-slate-400" />
                </div>
              </div>
            ))}
          </div>
          {bad && <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{fh("filters.priceInvalid")}</p>}
        </div>
      </div>

      <fieldset>
        <legend className={label}>{t("amenities")}</legend>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map(({ key, icon: Icon }) => {
            const on = f.amenities.includes(key);
            return (
              <label key={key} className={clsx("inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[0.82rem] font-semibold transition-all duration-300 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#48BDFA]", on ? "border-transparent bg-brand-gradient text-white shadow-[0_6px_16px_-8px_rgba(244,19,230,0.6)]" : "border-slate-200 bg-white/70 text-slate-600 hover:-translate-y-0.5 hover:bg-white motion-reduce:hover:translate-y-0")}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange({ amenities: toggle(f.amenities, key) })} />
                <Icon className="size-4" aria-hidden />{t(`amenity.${key}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={more || placeOn} onClick={() => setMore((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#0A84F0] transition-colors hover:bg-white/80"><SlidersHorizontal className="size-4" aria-hidden />{more || placeOn ? t("lessFilters") : t("moreFilters")}</button>
        {chips.map((c) => <button key={c.key} type="button" onClick={c.remove} aria-label={t("removeFilter", { name: c.text })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100">{c.text}<X className="size-3" aria-hidden /></button>)}
        {count > 0 && <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, mode: f.mode, sort: f.sort })} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#0A84F0] transition-colors hover:bg-white/80"><FilterX className="size-4" aria-hidden />{fh("filters.clearAll")}<span className="rounded-full bg-sky-100 px-1.5 text-[0.7rem] text-sky-700">{count}</span></button>}
      </div>

      {(more || placeOn) && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <GeoSelect id="mk-f-division" text={fh("filters.division")} level="divisions" parentId={null} value={f.division} onPick={(g) => onChange({ division: g, district: null, upazila: null, union: null })} />
            <GeoSelect id="mk-f-district" text={fh("filters.district")} level="districts" parentId={f.division?.id ?? null} value={f.district} parentName={fh("filters.division")} onPick={(g) => onChange({ district: g, upazila: null, union: null })} />
            <GeoSelect id="mk-f-upazila" text={fh("filters.upazila")} level="upazilas" parentId={f.district?.id ?? null} value={f.upazila} parentName={fh("filters.district")} onPick={(g) => onChange({ upazila: g, union: null })} />
            <GeoSelect id="mk-f-union" text={fh("filters.union")} level="unions" parentId={f.upazila?.id ?? null} value={f.union} parentName={fh("filters.upazila")} onPick={(g) => onChange({ union: g })} />
          </div>
          {isLand ? (
            <div className="sm:max-w-xs">
              <label htmlFor="mk-f-landtype" className={label}>{fh("filters.landType")}</label>
              <div className={shell}>
                <select id="mk-f-landtype" value={f.landType} onChange={(e) => onChange({ landType: e.target.value as LandType })} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
                  <option value="">{fh("filters.all")}</option>
                  {LAND_TYPES.map((k) => <option key={k} value={k}>{fh(`filters.landTypes.${k}`)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
              </div>
            </div>
          ) : (
            <div>
              <span className={label}>{t("bedrooms")}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("bedrooms")}>
                {[1, 2, 3, 4].map((b) => (
                  <button key={b} type="button" aria-pressed={f.beds.includes(b)} onClick={() => onChange({ beds: toggle(f.beds, b) })}
                    className={clsx("h-9 rounded-full border px-4 text-[0.82rem] font-semibold transition-all duration-300", f.beds.includes(b) ? "border-transparent bg-brand-gradient text-white" : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white")}>{fh("filters.bedN", { n: b })}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
