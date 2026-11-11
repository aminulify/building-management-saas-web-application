"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, FilterX, Loader2, MapPin, RefreshCw, Search, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { activeCount, cleanAmount, EMPTY_FILTERS, priceRangeInvalid, toggle } from "./filters";
import { useGeoList } from "./use-geo";
import type { AmenityKey, CategoryChoice, Filters, Furnishing, GeoItem, LandType, NearbyKey } from "./types";

interface Props { filters: Filters; onChange: (patch: Partial<Filters>) => void; /** Marketplace: land is a property type and has its own kind-of-land filter */ market?: boolean }

const label = "mb-1.5 block text-[0.68rem] font-bold uppercase tracking-wider text-label";
const shell = "glass-input relative flex h-11 items-center rounded-lg pl-3 pr-9";

export function GeoSelect({ id, text, level, parentId, value, parentName, emptyLabel, onPick }: { id: string; text: string; level: "divisions" | "districts" | "upazilas" | "unions"; parentId: string | null; value: GeoItem | null; parentName?: string; emptyLabel?: string; onPick: (g: GeoItem | null) => void }) {
  const t = useTranslations("owner.findHome.filters");
  const locale = useLocale();
  const { items, state, retry } = useGeoList(level, parentId);
  const disabled = (level !== "divisions" && !parentId) || state === "loading";
  const shown = (g: GeoItem) => (locale === "bn" ? g.bnName : g.name);
  // the picked item may come from the assistant before the list arrives: keep it visible meanwhile
  const options = value && !items.some((i) => i.id === value.id) ? [value, ...items] : items;
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <div className={clsx(shell, disabled && "opacity-70")}>
        <select
          id={id} value={value?.id ?? ""} disabled={disabled} aria-busy={state === "loading" || undefined}
          onChange={(e) => onPick(options.find((o) => o.id === e.target.value) ?? null)}
          className="h-full w-full min-w-0 cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none disabled:cursor-not-allowed"
        >
          <option value="">{state === "loading" ? t("geoLoading") : level !== "divisions" && !parentId ? t("chooseFirst", { parent: parentName ?? "" }) : (emptyLabel ?? t("all"))}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{shown(o)}</option>)}
        </select>
        {state === "loading" ? <Loader2 className="pointer-events-none absolute right-2.5 size-4 animate-spin text-slate-400" aria-hidden /> : <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />}
      </div>
      {state === "error" && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />{t("geoError")}
          <button type="button" onClick={retry} className="ml-auto inline-flex items-center gap-1 font-semibold text-[#0A84F0] hover:underline"><RefreshCw className="size-3" aria-hidden />{t("retry")}</button>
        </p>
      )}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={clsx(
        "h-9 rounded-full border px-4 text-[0.82rem] font-semibold transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48BDFA]",
        on ? "border-transparent bg-brand-gradient text-white shadow-[0_6px_16px_-8px_rgba(244,19,230,0.6)]" : "border-slate-200 bg-white/70 text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white motion-reduce:hover:translate-y-0",
      )}
    >
      {children}
    </button>
  );
}

const MORE_NEARBY: NearbyKey[] = ["SCHOOL", "MARKET"];
const MORE_AMENITY: AmenityKey[] = ["LIFT", "GENERATOR", "CCTV", "GATED"];
const FURNISH: Exclude<Furnishing, "">[] = ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"];
const TYPES: CategoryChoice[] = ["", "APARTMENT", "DUPLEX", "STUDIO", "COMMERCIAL"];
const MARKET_TYPES: CategoryChoice[] = [...TYPES, "LAND"];
const LAND_TYPES: Exclude<LandType, "">[] = ["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL"];

export function FilterCard({ filters: f, onChange, market = false }: Props) {
  const t = useTranslations("owner.findHome.filters");
  const [more, setMore] = useState(false);
  const count = activeCount(f);
  const bad = priceRangeInvalid(f);
  const extraOn = MORE_NEARBY.some((k) => f.nearby.includes(k)) || MORE_AMENITY.some((k) => f.amenities.includes(k)) || !!f.furnishing || f.beds.some((b) => b !== 2 && b !== 3);
  const showMore = more || extraOn;
  const isLand = f.category === "LAND";

  return (
    <section aria-label={t("aria")} className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><MapPin className="size-4 text-[#0A84F0]" aria-hidden />{t("location")}</h2>
        {count > 0 && (
          <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, mode: f.mode, sort: f.sort })} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#0A84F0] transition-colors hover:bg-white/80">
            <FilterX className="size-3.5" aria-hidden />{t("clearAll")} <span className="rounded-full bg-sky-100 px-1.5 text-[0.7rem] text-sky-700">{count}</span>
          </button>
        )}
      </div>

      <div className="glass-input mb-3 flex h-12 items-center gap-2.5 rounded-xl px-3.5">
        <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
        <label htmlFor="fh-search" className="sr-only">{t("searchLabel")}</label>
        <input id="fh-search" type="search" value={f.q} maxLength={80} autoComplete="off" onChange={(e) => onChange({ q: e.target.value })} placeholder={t("searchPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
        {f.q && <button type="button" onClick={() => onChange({ q: "" })} aria-label={t("searchClear")} className="rounded p-1 text-slate-400 hover:text-navy"><X className="size-4" aria-hidden /></button>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GeoSelect id="fh-division" text={t("division")} level="divisions" parentId={null} value={f.division} onPick={(g) => onChange({ division: g, district: null, upazila: null, union: null })} />
        <GeoSelect id="fh-district" text={t("district")} level="districts" parentId={f.division?.id ?? null} value={f.district} parentName={t("division")} onPick={(g) => onChange({ district: g, upazila: null, union: null })} />
        <GeoSelect id="fh-upazila" text={t("upazila")} level="upazilas" parentId={f.district?.id ?? null} value={f.upazila} parentName={t("district")} onPick={(g) => onChange({ upazila: g, union: null })} />
        <GeoSelect id="fh-union" text={t("union")} level="unions" parentId={f.upazila?.id ?? null} value={f.union} parentName={t("upazila")} onPick={(g) => onChange({ union: g })} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div>
          <span className={label} id="fh-price-label">{t("price")}</span>
          <div role="group" aria-labelledby="fh-price-label" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            {(["minPrice", "maxPrice"] as const).map((k, i) => (
              <div key={k} className="contents">
                {i === 1 && <span aria-hidden className="text-slate-400">–</span>}
                <div className="glass-input flex h-11 min-w-0 items-center gap-1.5 rounded-lg px-3" data-invalid={bad || undefined}>
                  <span aria-hidden className="text-sm font-semibold text-slate-400">৳</span>
                  <input
                    inputMode="numeric" autoComplete="off" value={f[k] ? Number(f[k]).toLocaleString("en-US") : ""} placeholder={t(i === 0 ? "min" : "max")} aria-label={t(i === 0 ? "min" : "max")} aria-invalid={bad || undefined}
                    onChange={(e) => onChange({ [k]: cleanAmount(e.target.value) })}
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-navy outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            ))}
          </div>
          {bad && <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("priceInvalid")}</p>}
        </div>
        <div>
          <label htmlFor="fh-type" className={label}>{t("propertyType")}</label>
          <div className={shell}>
            <select id="fh-type" value={f.category} onChange={(e) => onChange({ category: e.target.value as CategoryChoice, landType: "", beds: e.target.value === "LAND" ? [] : f.beds })} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
              {(market ? MARKET_TYPES : TYPES).map((c) => <option key={c || "any"} value={c}>{t(`types.${c || "any"}`)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
          </div>
          {market && isLand && (
            <div className="mt-3">
              <label htmlFor="fh-landtype" className={label}>{t("landType")}</label>
              <div className={shell}>
                <select id="fh-landtype" value={f.landType} onChange={(e) => onChange({ landType: e.target.value as LandType })} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
                  <option value="">{t("all")}</option>
                  {LAND_TYPES.map((k) => <option key={k} value={k}>{t(`landTypes.${k}`)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>{t("quick")}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("quick")}>
          {!isLand && <Pill on={f.beds.includes(2)} onClick={() => onChange({ beds: toggle(f.beds, 2) })}>{t("bed2")}</Pill>}
          {!isLand && <Pill on={f.beds.includes(3)} onClick={() => onChange({ beds: toggle(f.beds, 3) })}>{t("bed3")}</Pill>}
          <Pill on={f.nearby.includes("HOSPITAL")} onClick={() => onChange({ nearby: toggle(f.nearby, "HOSPITAL") })}>{t("hospital")}</Pill>
          <Pill on={f.nearby.includes("PARK")} onClick={() => onChange({ nearby: toggle(f.nearby, "PARK") })}>{t("park")}</Pill>
          <Pill on={f.amenities.includes("PARKING")} onClick={() => onChange({ amenities: toggle(f.amenities, "PARKING") })}>{t("parking")}</Pill>
          <Pill on={f.nearby.includes("MOSQUE")} onClick={() => onChange({ nearby: toggle(f.nearby, "MOSQUE") })}>{t("mosque")}</Pill>
          <Pill on={f.amenities.includes("SECURITY")} onClick={() => onChange({ amenities: toggle(f.amenities, "SECURITY") })}>{t("security")}</Pill>
          {!isLand && f.beds.filter((b) => b !== 2 && b !== 3).map((b) => <Pill key={b} on onClick={() => onChange({ beds: toggle(f.beds, b) })}>{t("bedN", { n: b })}</Pill>)}
          <button type="button" aria-expanded={showMore} onClick={() => setMore((v) => !v)} className="h-9 rounded-full px-3 text-[0.82rem] font-semibold text-[#0A84F0] transition-colors hover:bg-white/80">
            {showMore ? t("less") : t("more")}
          </button>
        </div>
        {showMore && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("more")}>
            {MORE_NEARBY.map((k) => <Pill key={k} on={f.nearby.includes(k)} onClick={() => onChange({ nearby: toggle(f.nearby, k) })}>{t(`nearby.${k}`)}</Pill>)}
            {MORE_AMENITY.map((k) => <Pill key={k} on={f.amenities.includes(k)} onClick={() => onChange({ amenities: toggle(f.amenities, k) })}>{t(`amenity.${k}`)}</Pill>)}
            {!isLand && FURNISH.map((k) => <Pill key={k} on={f.furnishing === k} onClick={() => onChange({ furnishing: f.furnishing === k ? "" : k })}>{t(`furnishing.${k}`)}</Pill>)}
          </div>
        )}
      </div>
    </section>
  );
}
