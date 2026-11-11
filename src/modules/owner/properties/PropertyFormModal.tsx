"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Box, Check, Home, Loader2, MapPin, Pencil, Ruler } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { ImagePicker } from "./ImagePicker";
import { propertyFormSchema, type PropertyFormValues } from "./schema";
import type { PropertyRow } from "./types";
import { uploadPropertyImage } from "./upload";

/** `add` opens an empty form, a row opens the edit form for that property, null = closed. */
export type FormTarget = "add" | PropertyRow | null;

interface Props { target: FormTarget; onClose: () => void; onSaved: () => void }

export function PropertyFormModal({ target, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={target !== null} onClose={onClose} labelledBy="property-form-title" busy={busy}>
      {target !== null && <Form target={target} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ target, onClose, onSaved, setBusy }: { target: "add" | PropertyRow; onClose: () => void; onSaved: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.properties.form");
  const v = useTranslations("validation");
  const toast = useToast();
  const editing = target === "add" ? null : target;

  const { register, handleSubmit, setError, setFocus, formState: { errors } } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema), mode: "onTouched",
    defaultValues: {
      name: editing?.name ?? "", location: editing?.locationText ?? editing?.locationLabel ?? "",
      totalSqft: editing ? String(editing.totalSqft ?? editing.sqft ?? "") : "", totalUnits: editing ? String(editing.declaredUnits ?? editing.totalUnits ?? "") : "",
    },
  });
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ text: string; upgrade?: boolean } | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  useEffect(() => { setBusy(saving); }, [saving, setBusy]);
  useEffect(() => { const id = setTimeout(() => setFocus("name"), 120); return () => clearTimeout(id); }, [setFocus]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    setSaving(true);
    const body = { name: f.name.trim(), locationText: f.location.trim(), totalSqft: Number(f.totalSqft), declaredUnits: Number(f.totalUnits) };
    let propertyId = editing?.id ?? "";
    try {
      if (editing) await authApi(`/properties/${editing.id}`, { method: "PATCH", body });
      else propertyId = (await authApi<{ id: string }>("/properties", { method: "POST", body })).id;
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "VALIDATION_ERROR" && e.issues.some((i) => i.code === "below_existing_units")) {
        setError("totalUnits", { message: "unitsBelowExisting" });
        setFocus("totalUnits");
      } else if (e instanceof ApiError && ["PLAN_LIMIT_REACHED", "SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_GRACE_RESTRICTED"].includes(e.code)) setBanner({ text: t(`errors.${e.code}` as never), upgrade: true });
      else if (e instanceof ApiError && e.code === "RATE_LIMITED") setBanner({ text: t("errors.RATE_LIMITED") });
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner({ text: t("errors.network") });
      else if (e instanceof ApiError && (e.code === "FORBIDDEN" || e.code === "ACCOUNT_SUSPENDED")) setBanner({ text: t("errors.forbidden") });
      else setBanner({ text: t("errors.generic") });
      return;
    }

    // photo: the property is already saved, so a failed upload is reported without losing the rest
    let photoFailed = false;
    try {
      if (editing && editing.coverImageId && (removeExisting || file)) await authApi(`/properties/${editing.id}/images/${editing.coverImageId}`, { method: "DELETE" });
      if (file) await uploadPropertyImage(propertyId, file);
    } catch { photoFailed = true; }

    toast(photoFailed ? "error" : "success", photoFailed ? t("photoFailed") : editing ? t("updated") : t("created"));
    onSaved();
    onClose();
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]">{editing ? <Pencil className="size-5" /> : <Home className="size-5" />}</span>
        <h2 id="property-form-title" className="text-xl font-bold text-navy sm:text-2xl">{editing ? t("editTitle") : t("addTitle")}</h2>
      </header>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <GlassField label={t("fields.name")} htmlFor="p-name" error={msg(errors.name?.message)}>
          <GlassInput id="p-name" icon={Home} autoComplete="off" placeholder={t("placeholders.name")} invalid={!!errors.name} disabled={saving} {...register("name")} />
        </GlassField>

        <ImagePicker file={file} existingUrl={removeExisting ? null : editing?.coverUrl} onChange={(f) => { setFile(f); if (f) setRemoveExisting(false); }} onRemoveExisting={() => setRemoveExisting(true)} disabled={saving} />

        <GlassField label={t("fields.location")} htmlFor="p-location" error={msg(errors.location?.message)}>
          <GlassInput id="p-location" icon={MapPin} autoComplete="off" placeholder={t("placeholders.location")} invalid={!!errors.location} disabled={saving} {...register("location")} />
        </GlassField>

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.sqft")} htmlFor="p-sqft" error={msg(errors.totalSqft?.message)}>
            <GlassInput id="p-sqft" icon={Ruler} inputMode="numeric" placeholder={t("placeholders.sqft")} invalid={!!errors.totalSqft} disabled={saving} {...register("totalSqft")} />
          </GlassField>
          <GlassField label={t("fields.units")} htmlFor="p-units" error={msg(errors.totalUnits?.message)}>
            <GlassInput id="p-units" icon={Box} inputMode="numeric" placeholder={t("placeholders.units")} invalid={!!errors.totalUnits} disabled={saving} {...register("totalUnits")} />
          </GlassField>
        </div>

        {banner && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{banner.text}{banner.upgrade && <> <Link href={"/home-owner/subscription" as never} className="font-bold underline underline-offset-2">{t("viewPlans")}</Link></>}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-48">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{saving ? t("saving") : editing ? t("saveChanges") : t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
