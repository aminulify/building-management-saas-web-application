"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Crosshair, ExternalLink, Loader2, LocateFixed, RefreshCw, Rocket, Save } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { GeoSelect } from "../find-home/FilterCard";
import { resolvePlaces } from "../find-home/filters";
import { mapOpen } from "../find-home/share";
import { loadGeo } from "../find-home/use-geo";
import type { HomeDetails } from "../find-home/types";
import { PhotoGrid } from "./PhotoGrid";
import { uploadListingPhoto } from "./photos";
import { priceBadge } from "./price";
import { Field, SelectField, Section, TextArea, TextField } from "./SellFields";
import { UpgradePanel } from "./UpgradeModal";
import { useZones } from "./use-zones";
import {
  AMENITY_OPTIONS, AREA_UNITS, CATEGORY_OPTIONS, CONDITIONS, FURNISHINGS, LAND_KINDS, STEPS, buildPayload, cleanInt, cleanNumber, emptySell, firstBadStep, isLand, parseCoords, validateSell, validateStep, valuesFromListing,
  type SellErrors, type SellValues, type StepKey,
} from "./sell-form";

// Leaflet touches `window`, so the map is loaded in the browser only
const MapPicker = dynamic(() => import("./MapPicker"), { ssr: false, loading: () => <div className="skeleton h-64 w-full rounded-xl sm:h-72" /> });

interface Props { open: boolean; editId: string | null; onClose: () => void; onDone: () => void }

export function SellModal({ open, editId, onClose, onDone }: Props) {
  return <Modal open={open} onClose={onClose} labelledBy="mk-sell-title" maxWidth="max-w-[840px]">{open && <Body editId={editId} onClose={onClose} onDone={onDone} />}</Modal>;
}

type Gate = { state: "loading" } | { state: "ok"; usage: number; limit: number } | { state: "blocked"; reason: "plan" | "limit" | "notReady" } | { state: "error" };

function Body({ editId, onClose, onDone }: Omit<Props, "open">) {
  const t = useTranslations("owner.marketplace.sell");
  const f = useTranslations("owner.findHome");
  const locale = useLocale();
  const toast = useToast();
  const { zones } = useZones();
  const [step, setStep] = useState<StepKey>("basics");
  const [v, setV] = useState<SellValues>(() => emptySell());
  const [original, setOriginal] = useState<ReturnType<typeof buildPayload> | null>(null);
  const [status, setStatus] = useState<string>("DRAFT");
  const [existing, setExisting] = useState<{ id: string; url: string }[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<SellErrors>({});
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [progress, setProgress] = useState("");
  const [loaded, setLoaded] = useState<"loading" | "ready" | "error">(editId ? "loading" : "ready");
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const [savedId, setSavedId] = useState<string | null>(editId);
  const [coordsText, setCoordsText] = useState("");
  const [coordsError, setCoordsError] = useState("");
  const [locating, setLocating] = useState(false);
  const [tick, setTick] = useState(0);

  const land = isLand(v);
  const set = useCallback(<K extends keyof SellValues>(k: K, val: SellValues[K]) => { setV((cur) => ({ ...cur, [k]: val })); setErrors((e) => (e[k as string] ? { ...e, [k as string]: undefined } : e)); }, []);
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}`) : undefined);

  useEffect(() => {
    let off = false;
    authApi<{ usage: number; limit: number }>("/listings/eligibility")
      .then((r) => { if (!off) setGate({ state: "ok", usage: r.usage, limit: r.limit }); })
      .catch((e) => { if (!off) setGate(e instanceof ApiError && e.code === "OWNER_NOT_READY" ? { state: "blocked", reason: "notReady" } : e instanceof ApiError && (e.code === "LISTING_ENTITLEMENT_REQUIRED" || e.status === 403) ? { state: "blocked", reason: "plan" } : e instanceof ApiError && e.code === "PLAN_LIMIT_REACHED" ? { state: "blocked", reason: "limit" } : { state: "error" }); });
    return () => { off = true; };
  }, [tick]);

  useEffect(() => {
    if (!editId) return;
    let off = false;
    setLoaded("loading");
    authApi<HomeDetails & { division?: string; district?: string; upazila?: string; unionName?: string }>(`/listings/${editId}`)
      .then(async (l) => {
        if (off) return;
        const places = await resolvePlaces({ division: l.division, district: l.district, upazila: l.upazila, unionName: l.unionName }, loadGeo);
        const vals = { ...valuesFromListing(l), ...places };
        if (off) return;
        setV(vals); setOriginal(buildPayload(vals)); setStatus(l.status); setExisting(l.photoList ?? []); setLoaded("ready");
      })
      .catch(() => { if (!off) setLoaded("error"); });
    return () => { off = true; };
  }, [editId, tick]);

  const point = useMemo(() => (v.lat !== "" && v.lng !== "" && !Number.isNaN(Number(v.lat)) && !Number.isNaN(Number(v.lng)) ? { lat: Number(v.lat), lng: Number(v.lng) } : null), [v.lat, v.lng]);
  const pickPoint = useCallback((lat: number, lng: number) => { setV((c) => ({ ...c, lat: String(lat), lng: String(lng) })); setErrors((e) => ({ ...e, lat: undefined })); setCoordsError(""); }, []);

  function applyCoords() {
    const c = parseCoords(coordsText);
    if (!c) { setCoordsError(t("errors.coordsParse")); return; }
    pickPoint(c.lat, c.lng);
  }
  function locate() {
    if (!navigator.geolocation) { setCoordsError(t("errors.noGeo")); return; }
    setLocating(true); setCoordsError("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); pickPoint(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); },
      () => { setLocating(false); setCoordsError(t("errors.geoDenied")); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function explain(e: unknown) {
    if (e instanceof ApiError) {
      if (e.code === "OWNER_NOT_READY") { setGate({ state: "blocked", reason: "notReady" }); return; }
      if (e.code === "LISTING_ENTITLEMENT_REQUIRED") { setGate({ state: "blocked", reason: "plan" }); return; }
      if (e.code === "PLAN_LIMIT_REACHED") { setGate({ state: "blocked", reason: "limit" }); return; }
      if (e.status === 422 && e.issues.length) {
        const next: SellErrors = {};
        for (const i of e.issues) { const path = String(i.path ?? "form").split(".")[0]!; next[path === "images" ? "photos" : path] = path === "images" ? "photosRequired" : path === "declaration" ? "declaration" : "serverField"; }
        setErrors(next); setForm(t("errors.fixFields")); const bad = firstBadStep(next); if (bad) setStep(bad); return;
      }
      if (e.status === 429) { setForm(t("errors.rate")); return; }
      if (e.status === 403 && e.reason === "not_your_upload") { setForm(t("errors.photoUpload")); return; }
    }
    setForm(t("errors.generic"));
  }

  const stepIndex = STEPS.indexOf(step);
  function next() {
    setForm("");
    const issues = validateStep(v, step);
    if (Object.keys(issues).length) { setErrors((e) => ({ ...e, ...issues })); setForm(t("errors.fixFields")); return; }
    setStep(STEPS[stepIndex + 1]!);
    document.getElementById("mk-sell-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function run(publish: boolean) {
    setForm("");
    const issues: SellErrors = validateSell({ ...v, declaration: publish ? v.declaration : true });
    const photoCount = existing.length - removed.length + files.length;
    if (publish && photoCount < 1) issues.photos = "photosRequired";
    if (Object.keys(issues).length) { setErrors(issues); setForm(t("errors.fixFields")); const bad = firstBadStep(issues); if (bad) setStep(bad); return; }
    setErrors({}); setBusy(publish ? "publish" : "draft");
    try {
      const payload = buildPayload(v);
      let id = savedId;
      if (!id) {
        setProgress(t("progress.saving"));
        id = (await authApi<{ id: string }>("/listings", { method: "POST", body: payload })).id;
        setSavedId(id); setOriginal(payload);
      } else if (original) {
        // only what changed: a live listing goes back to review only when an important field really changed
        const changed = Object.fromEntries(Object.entries(payload).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify((original as Record<string, unknown>)[k])));
        if (Object.keys(changed).length) { setProgress(t("progress.saving")); await authApi(`/listings/${id}`, { method: "PATCH", body: changed }); setOriginal(payload); }
      }
      let order = existing.length - removed.length;
      for (const [i, file] of files.entries()) { setProgress(t("progress.photo", { n: i + 1, total: files.length })); await uploadListingPhoto(id, file, order++); }
      setFiles([]);
      for (const imageId of removed) await authApi(`/listings/${id}/images/${imageId}`, { method: "DELETE" });
      setRemoved([]);
      if (publish && (status === "DRAFT" || status === "REJECTED" || !editId)) { setProgress(t("progress.submitting")); await authApi(`/listings/${id}/submit`, { method: "POST" }); }
      toast("success", publish ? t(editId && status === "PUBLISHED" ? "toast.updated" : "toast.published") : t("toast.draft"));
      onDone(); onClose();
    } catch (e) { explain(e); } finally { setBusy(null); setProgress(""); }
  }

  const unit = (u: string) => f(`card.unit.${u}`);
  const title = editId ? t("editTitle") : t("createTitle");
  const locked = busy !== null;
  const categories = [...new Set<string>([...CATEGORY_OPTIONS, v.category])];
  const preview = Number(v.price) > 0 ? priceBadge(locale, Number(v.price), v.mode) : null;
  const zoneOptions = zones.map((z) => ({ value: z.id, label: locale === "bn" ? z.nameBn : z.nameEn }));

  if (loaded === "loading" || gate.state === "loading") return <div aria-busy="true" className="space-y-4 pt-6"><span id="mk-sell-title" className="sr-only">{t("loading")}</span><div className="skeleton h-8 w-1/2 rounded-lg" /><div className="skeleton h-40 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>;
  if (loaded === "error" || gate.state === "error") return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center"><AlertTriangle className="size-9 text-red-500" aria-hidden />
      <h2 id="mk-sell-title" className="text-lg font-bold text-navy">{t("loadError")}</h2>
      <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{f("states.retry")}</button></div>
  );
  if (gate.state === "blocked" && !savedId) return <UpgradePanel reason={gate.reason} />;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step === "finish") void run(true); else next(); }} noValidate className="space-y-5 pt-1">
      <header className="pr-10">
        <h2 id="mk-sell-title" className="text-xl font-bold text-navy">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        {gate.state === "ok" && <p className="mt-2 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{t("quota", { used: gate.usage, limit: gate.limit })}</p>}
        {editId && status === "PUBLISHED" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{t("reviewAgain")}</p>}
        {editId && status === "REJECTED" && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{t("wasRejected")}</p>}
      </header>

      <ol className="flex items-center gap-1.5" aria-label={t("stepsLabel")}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-1.5" aria-current={s === step ? "step" : undefined}>
            <button type="button" disabled={i > stepIndex || locked} onClick={() => setStep(s)} className={clsx("flex min-w-0 items-center gap-2 rounded-full py-1 pr-2 text-xs font-semibold transition-colors", i <= stepIndex ? "text-navy" : "text-slate-400")}>
              <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold transition-all duration-300", i < stepIndex ? "bg-emerald-500 text-white" : i === stepIndex ? "bg-brand-gradient text-white shadow-[0_6px_14px_-6px_rgba(244,19,230,0.7)]" : "bg-slate-100 text-slate-400")}>{i < stepIndex ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
              <span className="hidden truncate sm:inline">{t(`steps.${s}`)}</span>
            </button>
            {i < STEPS.length - 1 && <span aria-hidden className={clsx("h-0.5 flex-1 rounded transition-colors duration-300", i < stepIndex ? "bg-emerald-400" : "bg-slate-200")} />}
          </li>
        ))}
      </ol>

      {step === "basics" && (
        <div className="space-y-5">
          <Section title={t("sections.photos")}>
            <PhotoGrid existing={existing.filter((p) => !removed.includes(p.id))} files={files} onFiles={(x) => { setFiles(x); setErrors((e) => ({ ...e, photos: undefined })); }} onRemoveExisting={(id) => setRemoved((r) => [...r, id])} error={errors.photos} disabled={locked} />
          </Section>
          <Section title={t("sections.basics")}>
            <TextField id="mk-title" text={t("fields.title")} value={v.title} onValue={(x) => set("title", x)} error={err("title")} maxLength={140} placeholder={t("placeholders.title")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField id="mk-category" text={t("fields.category")} value={v.category} onValue={(x) => setV((c) => ({ ...c, category: x, areaUnit: x === "LAND" ? "KATHA" : c.areaUnit === "SQFT" || c.category === "LAND" ? "SQFT" : c.areaUnit }))} options={categories.map((c) => ({ value: c, label: t(`categories.${c}`) }))} />
              <SelectField id="mk-cond" text={t("fields.condition")} value={v.condition} onValue={(x) => set("condition", x)} emptyLabel={t("choose")} error={err("condition")} options={CONDITIONS.map((k) => ({ value: k, label: f(`details.conditions.${k}`) }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
              <div role="group" aria-label={t("fields.mode")} className="inline-flex rounded-xl border border-slate-200 bg-white/70 p-1">
                {(["SALE", "RENT"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={v.mode === m} onClick={() => set("mode", m)} className={clsx("h-9 rounded-lg px-4 text-sm font-semibold transition-all duration-300", v.mode === m ? "bg-brand-gradient text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}>{t(`modes.${m}`)}</button>
                ))}
              </div>
              <TextField id="mk-price" text={t(v.mode === "RENT" ? "fields.rent" : "fields.price")} value={v.price} onValue={(x) => set("price", cleanInt(x, 11))} error={err("price")} prefix="৳" inputMode="numeric" autoComplete="off" hint={preview ? `${preview.text}${preview.suffix}` : undefined} />
              <label className="flex h-11 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={v.negotiable} onChange={(e) => set("negotiable", e.target.checked)} className="size-4 accent-[#7b2ff7]" />{t("fields.negotiable")}</label>
            </div>
            <TextArea id="mk-desc" text={t("fields.description")} value={v.description} onValue={(x) => set("description", x)} error={err("description")} max={5000} hint={t("descHint", { n: v.description.trim().length })} />
          </Section>
        </div>
      )}

      {step === "details" && (
        <Section title={t(land ? "sections.landDetails" : "sections.flatDetails")}>
          {!land && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <TextField id="mk-beds" text={t("fields.bedrooms")} value={v.bedrooms} onValue={(x) => set("bedrooms", cleanInt(x, 2))} error={err("bedrooms")} inputMode="numeric" />
              <TextField id="mk-baths" text={t("fields.bathrooms")} value={v.bathrooms} onValue={(x) => set("bathrooms", cleanInt(x, 2))} inputMode="numeric" />
              <TextField id="mk-balc" text={t("fields.balconies")} value={v.balconies} onValue={(x) => set("balconies", cleanInt(x, 2))} inputMode="numeric" />
              <TextField id="mk-floor" text={t("fields.floor")} value={v.floor} onValue={(x) => set("floor", cleanInt(x, 3))} inputMode="numeric" />
              <TextField id="mk-floors" text={t("fields.totalFloors")} value={v.totalFloors} onValue={(x) => set("totalFloors", cleanInt(x, 3))} inputMode="numeric" />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField id="mk-area" text={t(land ? "fields.landArea" : "fields.area")} value={v.area} onValue={(x) => set("area", cleanNumber(x))} error={err("area")} inputMode="decimal" autoComplete="off" />
            <SelectField id="mk-unit" text={t("fields.areaUnit")} value={v.areaUnit} onValue={(x) => set("areaUnit", x as SellValues["areaUnit"])} options={AREA_UNITS.filter((u) => (land ? true : u === "SQFT" || u === "KATHA")).map((u) => ({ value: u, label: unit(u) }))} />
            {land
              ? <SelectField id="mk-landtype" text={t("fields.landType")} value={v.landType} onValue={(x) => set("landType", x)} emptyLabel={t("choose")} options={LAND_KINDS.map((k) => ({ value: k, label: f(`details.landTypes.${k}`) }))} />
              : <SelectField id="mk-furn" text={t("fields.furnishing")} value={v.furnishing} onValue={(x) => set("furnishing", x)} emptyLabel={t("choose")} options={FURNISHINGS.map((k) => ({ value: k, label: f(`filters.furnishing.${k}`) }))} />}
          </div>
          {land && (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField id="mk-road" text={t("fields.roadWidth")} value={v.roadWidthFt} onValue={(x) => set("roadWidthFt", cleanNumber(x, 5))} error={err("roadWidthFt")} suffix={f("details.ftShort")} inputMode="decimal" />
              <TextField id="mk-plot" text={t("fields.plotNo")} value={v.plotNo} onValue={(x) => set("plotNo", x)} maxLength={40} />
              <TextField id="mk-mouza" text={t("fields.mouza")} value={v.mouza} onValue={(x) => set("mouza", x)} maxLength={80} />
            </div>
          )}
        </Section>
      )}

      {step === "location" && (
        <Section title={t("sections.location")}>
          <TextField id="mk-address" text={t("fields.address")} value={v.fullAddress} onValue={(x) => set("fullAddress", x)} maxLength={300} placeholder={t("placeholders.address")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField id="mk-zone" text={t("fields.zone")} value={v.zoneId} onValue={(x) => set("zoneId", x)} emptyLabel={t("noZone")} options={zoneOptions} />
            <TextField id="mk-postal" text={t("fields.postalCode")} value={v.postalCode} onValue={(x) => set("postalCode", cleanInt(x, 4))} error={err("postalCode")} inputMode="numeric" placeholder="1311" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><GeoSelect id="mk-division" text={t("fields.division")} level="divisions" parentId={null} value={v.division} emptyLabel={t("choose")} onPick={(g) => { setV((c) => ({ ...c, division: g, district: null, upazila: null, union: null })); setErrors((e) => ({ ...e, division: undefined })); }} />{errors.division && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err("division")}</p>}</div>
            <div><GeoSelect id="mk-district" text={t("fields.district")} level="districts" parentId={v.division?.id ?? null} value={v.district} parentName={t("fields.division")} emptyLabel={t("choose")} onPick={(g) => { setV((c) => ({ ...c, district: g, upazila: null, union: null })); setErrors((e) => ({ ...e, district: undefined })); }} />{errors.district && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err("district")}</p>}</div>
            <div><GeoSelect id="mk-upazila" text={t("fields.upazila")} level="upazilas" parentId={v.district?.id ?? null} value={v.upazila} parentName={t("fields.district")} emptyLabel={t("choose")} onPick={(g) => { setV((c) => ({ ...c, upazila: g, union: null })); setErrors((e) => ({ ...e, upazila: undefined })); }} />{errors.upazila && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err("upazila")}</p>}</div>
            <GeoSelect id="mk-union" text={t("fields.union")} level="unions" parentId={v.upazila?.id ?? null} value={v.union} parentName={t("fields.upazila")} emptyLabel={t("choose")} onPick={(g) => set("union", g)} />
          </div>

          <Field id="mk-coords" text={t("fields.mapPoint")} error={err("lat") ?? (coordsError || undefined)} hint={t("mapHint")}>
            <MapPicker lat={point?.lat ?? null} lng={point?.lng ?? null} onPick={pickPoint} label={t("mapPreview")} />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="glass-input flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
                <Crosshair className="size-4 shrink-0 text-slate-400" aria-hidden />
                <input id="mk-coords" value={coordsText} onChange={(e) => setCoordsText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoords(); } }} placeholder={t("placeholders.coords")} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-slate-400" />
              </div>
              <button type="button" onClick={applyCoords} className="btn btn-white h-11 px-4 text-sm">{t("applyPoint")}</button>
              <button type="button" onClick={locate} disabled={locating} className="btn btn-white h-11 px-4 text-sm">{locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}{t("useMyLocation")}</button>
            </div>
          </Field>
          {point && (
            <div className="flex items-center justify-between gap-3 text-xs text-label">
              <span dir="ltr" className="font-semibold text-navy">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
              <span className="flex gap-3"><a href={mapOpen(point.lat, point.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#0A84F0] hover:underline"><ExternalLink className="size-3" aria-hidden />{f("details.openMap")}</a>
                <button type="button" onClick={() => { set("lat", ""); set("lng", ""); setCoordsText(""); }} className="font-semibold text-red-600 hover:underline">{t("clearPoint")}</button></span>
            </div>
          )}
        </Section>
      )}

      {step === "finish" && (
        <div className="space-y-5">
          <Section title={t("sections.amenities")}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label={t("sections.amenities")}>
              {AMENITY_OPTIONS.map((a) => {
                const on = v.amenities.includes(a);
                return (
                  <label key={a} className={clsx("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-300", on ? "border-[#48BDFA] bg-sky-50 text-navy" : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300")}>
                    <input type="checkbox" checked={on} onChange={() => set("amenities", on ? v.amenities.filter((x) => x !== a) : [...v.amenities, a])} className="size-4 accent-[#7b2ff7]" />{t(`amenities.${a}`)}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-label">{t("amenityHint")}</p>
          </Section>
          <Section title={t("sections.review")}>
            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-label">{t("fields.title")}</dt><dd className="font-semibold text-navy">{v.title || "–"}</dd></div>
              <div><dt className="text-xs font-semibold text-label">{t("fields.price")}</dt><dd className="font-extrabold text-[#0A84F0]">{preview ? `${preview.text}${preview.suffix}` : "–"}</dd></div>
              <div><dt className="text-xs font-semibold text-label">{t("fields.category")}</dt><dd className="font-semibold text-navy">{t(`categories.${v.category}`)} · {t(`modes.${v.mode}`)}</dd></div>
              <div><dt className="text-xs font-semibold text-label">{t("sections.location")}</dt><dd className="font-semibold text-navy">{[v.union?.name, v.upazila?.name, v.district?.name].filter(Boolean).join(", ") || "–"}</dd></div>
              <div><dt className="text-xs font-semibold text-label">{t("sections.photos")}</dt><dd className="font-semibold text-navy">{existing.length - removed.length + files.length}</dd></div>
              <div><dt className="text-xs font-semibold text-label">{t("fields.mapPoint")}</dt><dd className="font-semibold text-navy">{point ? t("pinSet") : t("pinNotSet")}</dd></div>
            </dl>
          </Section>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={v.declaration} onChange={(e) => set("declaration", e.target.checked)} className="mt-0.5 size-4 accent-[#7b2ff7]" aria-invalid={!!errors.declaration || undefined} />
            <span>{t("declaration")}</span>
          </label>
          {errors.declaration && <p role="alert" className="text-xs font-medium text-red-600">{err("declaration")}</p>}
          {errors.photos && <p role="alert" className="text-xs font-medium text-red-600">{err("photos")}</p>}
        </div>
      )}

      <div className="space-y-3 border-t border-slate-100 pt-4">
        {form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{form}</p>}
        {progress && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden />{progress}</p>}
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} disabled={locked} className="btn btn-white h-11 px-5 text-sm">{t("cancel")}</button>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
            {stepIndex > 0 && <button type="button" onClick={() => setStep(STEPS[stepIndex - 1]!)} disabled={locked} className="btn btn-glass h-11 px-5 text-sm"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</button>}
            {step !== "finish" ? (
              <button type="submit" className="btn btn-primary h-11 px-6 text-sm">{t("next")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></button>
            ) : (
              <>
                {(!editId || status === "DRAFT") && <button type="button" onClick={() => void run(false)} disabled={locked} className="btn btn-glass h-11 px-5 text-sm">{busy === "draft" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}{t("saveDraft")}</button>}
                <button type="submit" disabled={locked} className="btn btn-primary h-11 px-6 text-sm">{busy === "publish" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{t(editId && status === "PUBLISHED" ? "saveChanges" : "publish")}</button>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-label">{t("reviewNote")}</p>
      </div>
    </form>
  );
}
