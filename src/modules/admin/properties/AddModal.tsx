"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Building2, Check, ChevronDown, DoorOpen, ImagePlus, Loader2, MapPin, Plus, Ruler, Search, Sparkles, User, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { AMENITY_CODES, FURNISHING_CODES } from "./amenities";
import type { OwnerChoice } from "./types";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, MAX_PHOTOS, uploadPropertyPhoto } from "./upload-image";

const TYPES = ["APARTMENT_BUILDING", "HOUSE", "COMMERCIAL", "MIXED"] as const;

/** Error texts are keys of the shared "validation" namespace, like the owner's Properties form. */
const schema = z.object({
  ownerId: z.string().uuid("ownerRequired"),
  name: z.string().trim().min(2, "propertyNameMin").max(120, "propertyNameMin"),
  type: z.enum(TYPES),
  locationText: z.string().trim().min(3, "propertyLocationMin").max(200, "propertyLocationMin"),
  declaredUnits: z.coerce.number({ message: "unitsRequired" }).int("wholeNumber").min(1, "unitsRange").max(1000, "unitsRange"),
  amenities: z.array(z.string()).optional(),
  totalSqft: z.union([z.literal(""), z.coerce.number().int("wholeNumber").min(1, "sqftRange").max(10_000_000, "sqftRange")]).optional(),
});
type Values = z.input<typeof schema>;

interface Props { open: boolean; onClose: () => void; onCreated: () => void }

export function AddModal({ open, onClose, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="pa-title" busy={busy} maxWidth="max-w-[600px]">
      {open && <Form onClose={onClose} onCreated={onCreated} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ onClose, onCreated, setBusy }: { onClose: () => void; onCreated: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("admin.properties.add");
  const v = useTranslations("validation");
  const tp = useTranslations("admin.properties");
  const toast = useToast();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { type: "APARTMENT_BUILDING", ownerId: "", amenities: [] } });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [owners, setOwners] = useState<OwnerChoice[] | null>(null);
  const [ownerError, setOwnerError] = useState(false);
  const ownerId = watch("ownerId");
  const amenities = watch("amenities") ?? [];
  const [menu, setMenu] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  const addPhotos = (list: FileList | null) => {
    setPhotoError(null);
    const next = [...photos];
    for (const f of Array.from(list ?? [])) {
      if (!IMAGE_TYPES.includes(f.type)) { setPhotoError(v("imageType")); continue; }
      if (f.size > IMAGE_MAX_BYTES) { setPhotoError(v("imageSize")); continue; }
      if (next.length >= MAX_PHOTOS) { setPhotoError(t("photosMax", { max: MAX_PHOTOS })); break; }
      const url = URL.createObjectURL(f); urls.current.push(url); next.push({ file: f, url });
    }
    setPhotos(next);
    if (picker.current) picker.current.value = "";
  };
  const toggleAmenity = (code: string) => {
    // one furnishing choice only: picking another replaces it
    const without = amenities.filter((a) => a !== code && !(FURNISHING_CODES.includes(code as never) && FURNISHING_CODES.includes(a as never)));
    setValue("amenities", amenities.includes(code) ? without : [...without, code]);
  };
  const picked = owners?.find((o) => o.id === ownerId);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : t(`errors.${key}`)) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  // owners to choose from: searched on the server as the admin types
  useEffect(() => {
    let off = false;
    const h = setTimeout(() => {
      setOwnerError(false);
      authApi<{ items: OwnerChoice[] }>(`/admin/properties/owners${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ""}`)
        .then((r) => { if (!off) setOwners(r.items); }).catch(() => { if (!off) setOwnerError(true); });
    }, term ? 300 : 0);
    return () => { off = true; clearTimeout(h); };
  }, [term]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      const made = await authApi<{ id: string }>("/admin/properties", { method: "POST", body: { ownerId: f.ownerId, name: f.name, type: f.type, locationText: f.locationText, declaredUnits: Number(f.declaredUnits), ...(f.totalSqft ? { totalSqft: Number(f.totalSqft) } : {}), amenities: f.amenities ?? [] } });
      // photos go up one by one; the property already exists, so a failed photo never loses the form
      let failed = 0;
      for (const p of photos) { try { await uploadPropertyPhoto(made.id, p.file); } catch { failed += 1; } }
      toast(failed ? "error" : "success", failed ? t("donePhotosFailed", { count: failed }) : t("done"));
      onCreated(); onClose();
    } catch (e) {
      setSaving(false);
      setBanner(e instanceof ApiError && e.code === "VALIDATION_ERROR" ? t("errors.invalid") : e instanceof ApiError && e.code === "NETWORK" ? t("errors.network") : t("errors.generic"));
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Plus className="size-5" /></span>
        <div><h2 id="pa-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <input type="hidden" {...register("ownerId")} />
        <GlassField label={t("owner")} htmlFor="pa-owner-search" error={msg(errors.ownerId?.message as string | undefined)}>
          <GlassInput id="pa-owner-search" icon={Search} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("ownerSearch")} disabled={saving} autoComplete="off" />
          <ul role="listbox" aria-label={t("owner")} className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/80 p-1">
            {owners === null && !ownerError && <li className="skeleton h-9 rounded-lg" aria-busy="true" />}
            {ownerError && <li role="alert" className="px-3 py-2 text-xs font-medium text-red-600">{t("ownersError")}</li>}
            {owners?.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">{t("noOwners")}</li>}
            {owners?.map((o) => (
              <li key={o.id} role="option" aria-selected={o.id === ownerId}>
                <button type="button" onClick={() => setValue("ownerId", o.id, { shouldValidate: true, shouldTouch: true })} className={clsx("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-300", o.id === ownerId ? "bg-sky-100 text-[#0A84F0]" : "hover:bg-slate-100")}>
                  <User className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate font-semibold">{o.fullName}</span><span className="shrink-0 text-xs text-slate-500">{formatPhone(o.phone)}</span>{o.id === ownerId && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          {picked && <p className="mt-1.5 text-xs font-medium text-emerald-700">{t("picked", { name: picked.fullName })}</p>}
        </GlassField>

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("name")} htmlFor="pa-name" error={msg(errors.name?.message as string | undefined)}><GlassInput id="pa-name" icon={Building2} invalid={!!errors.name} disabled={saving} {...register("name")} /></GlassField>
          <GlassField label={t("type")} htmlFor="pa-type"><GlassSelect id="pa-type" icon={Building2} disabled={saving} {...register("type")}>{TYPES.map((x) => <option key={x} value={x}>{tp(`types.${x}`)}</option>)}</GlassSelect></GlassField>
          <GlassField label={t("location")} htmlFor="pa-location" className="sm:col-span-2" error={msg(errors.locationText?.message as string | undefined)}><GlassInput id="pa-location" icon={MapPin} invalid={!!errors.locationText} disabled={saving} placeholder={t("locationHint")} {...register("locationText")} /></GlassField>
          <GlassField label={t("units")} htmlFor="pa-units" error={msg(errors.declaredUnits?.message as string | undefined)}><GlassInput id="pa-units" icon={DoorOpen} inputMode="numeric" invalid={!!errors.declaredUnits} disabled={saving} {...register("declaredUnits")} /></GlassField>
          <GlassField label={t("sqft")} htmlFor="pa-sqft" error={msg(errors.totalSqft?.message as string | undefined)}><GlassInput id="pa-sqft" icon={Ruler} inputMode="numeric" invalid={!!errors.totalSqft} disabled={saving} {...register("totalSqft")} /></GlassField>
        </div>

        <GlassField label={t("amenities")} htmlFor="pa-amenities" hint={t("amenitiesHint")}>
          <button id="pa-amenities" type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="pa-amenity-list" disabled={saving} className="glass-input flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left">
            <Sparkles className="size-5 shrink-0 text-slate-400" aria-hidden />
            <span className={clsx("min-w-0 flex-1 truncate text-[0.95rem]", amenities.length ? "text-navy" : "text-slate-300")}>{amenities.length ? t("amenitiesCount", { count: amenities.length }) : t("amenitiesPlaceholder")}</span>
            <ChevronDown className={clsx("size-4 shrink-0 text-slate-400 transition-transform duration-300", menu && "rotate-180")} aria-hidden />
          </button>
          {menu && (
            <ul id="pa-amenity-list" role="group" aria-label={t("amenities")} className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-2 sm:grid-cols-2">
              {AMENITY_CODES.map((c) => (
                <li key={c}>
                  <label className={clsx("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-300", amenities.includes(c) ? "bg-sky-100 font-semibold text-[#0A84F0]" : "text-navy hover:bg-slate-100")}>
                    <input type="checkbox" checked={amenities.includes(c)} onChange={() => toggleAmenity(c)} disabled={saving} className="size-4 accent-[#0A84F0]" />{tp(`amenity.${c}`)}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {amenities.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("amenitiesChosen")}>
              {amenities.map((c) => <li key={c}><button type="button" onClick={() => toggleAmenity(c)} disabled={saving} aria-label={t("removeAmenity", { name: tp(`amenity.${c}`) })} className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-[#0A84F0] transition-colors duration-300 hover:bg-sky-200">{tp(`amenity.${c}`)}<X className="size-3" aria-hidden /></button></li>)}
            </ul>
          )}
        </GlassField>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("photos")}</p>
          <input ref={picker} type="file" accept={IMAGE_TYPES.join(",")} multiple onChange={(e) => addPhotos(e.target.files)} className="sr-only" id="pa-photos" disabled={saving} />
          <label htmlFor="pa-photos" className={clsx("flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 px-4 py-5 text-center transition-colors duration-300 hover:border-[#48BDFA] hover:bg-sky-50/60 focus-within:outline-2 focus-within:outline-[#48BDFA]", (saving || photos.length >= MAX_PHOTOS) && "pointer-events-none opacity-60")}>
            <ImagePlus className="size-6 text-[#0A84F0]" aria-hidden />
            <span className="text-sm font-semibold text-navy">{t("photosUpload")}</span>
            <span className="text-xs text-slate-500">{t("photosHint", { max: MAX_PHOTOS })}</span>
          </label>
          {photoError && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{photoError}</p>}
          {photos.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t("photosChosen")}>
              {photos.map((p, i) => (
                <li key={p.url} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img src={p.url} alt={t("photoAlt", { n: i + 1 })} className="size-full object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-white">{t("cover")}</span>}
                  <button type="button" disabled={saving} onClick={() => setPhotos((cur) => cur.filter((x) => x.url !== p.url))} aria-label={t("removePhoto", { n: i + 1 })} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 text-slate-700 shadow transition-colors duration-300 hover:bg-red-50 hover:text-red-600"><X className="size-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}{saving ? t("saving") : t("save")}</button>
        </div>
      </form>
    </>
  );
}
