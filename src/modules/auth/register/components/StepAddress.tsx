"use client";

import { useEffect } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { useGeoList, type GeoItem } from "../hooks";
import type { RegisterFormValues } from "../schema";
import { useFieldError } from "./useFieldError";

export function StepAddress() {
  const t = useTranslations("auth.register");
  const locale = useLocale();
  const { register, watch, setValue, formState: { errors } } = useFormContext<RegisterFormValues>();
  const err = useFieldError<RegisterFormValues>();

  const division = watch("division");
  const district = watch("district");

  const divisions = useGeoList("/geo/divisions");
  const divisionId = divisions.items.find((d) => d.nameEn === division)?.id;
  const districts = useGeoList(divisionId ? `/geo/districts?division=${divisionId}` : null);
  const districtId = districts.items.find((d) => d.nameEn === district)?.id;
  const upazilas = useGeoList(districtId ? `/geo/upazilas?district=${districtId}` : null);

  const label = (g: GeoItem) => (locale === "bn" ? g.nameBn : g.nameEn);

  // a changed parent invalidates the children
  useEffect(() => { if (district && districts.items.length && !districts.items.some((d) => d.nameEn === district)) { setValue("district", ""); setValue("upazila", ""); } }, [districts.items, district, setValue]);

  const failed = divisions.error || districts.error || upazilas.error;
  const retryAll = () => { divisions.retry(); districts.retry(); upazilas.retry(); };
  // when the database has no list for this district yet, the user types the thana/upazila by hand
  const upazilaFree = !!districtId && !upazilas.loading && !upazilas.error && upazilas.items.length === 0;

  return (
    <div className="space-y-5">
      {failed && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          <span>{t("geoError")}</span>
          <button type="button" onClick={retryAll} className="inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <GlassField label={t("fields.division")} htmlFor="division" error={err("division")}>
          <GlassSelect id="division" icon={MapPin} loading={divisions.loading} invalid={!!errors.division} autoComplete="address-level1"
            {...register("division", { onChange: () => { setValue("district", ""); setValue("upazila", ""); } })}>
            <option value="">{t("placeholders.division")}</option>
            {divisions.items.map((d) => <option key={d.id} value={d.nameEn}>{label(d)}</option>)}
          </GlassSelect>
        </GlassField>

        <GlassField label={t("fields.district")} htmlFor="district" error={err("district")}>
          <GlassSelect id="district" icon={MapPin} loading={districts.loading} disabled={!divisionId} invalid={!!errors.district}
            {...register("district", { onChange: () => setValue("upazila", "") })}>
            <option value="">{t("placeholders.district")}</option>
            {districts.items.map((d) => <option key={d.id} value={d.nameEn}>{label(d)}</option>)}
          </GlassSelect>
        </GlassField>

        <GlassField label={t("fields.upazila")} htmlFor="upazila" error={err("upazila")} hint={upazilaFree ? t("hints.upazilaFree") : undefined}>
          {upazilaFree ? (
            <GlassInput id="upazila" icon={MapPin} placeholder={t("placeholders.upazilaFree")} invalid={!!errors.upazila} {...register("upazila")} />
          ) : (
            <GlassSelect id="upazila" icon={MapPin} loading={upazilas.loading} disabled={!districtId} invalid={!!errors.upazila} {...register("upazila")}>
              <option value="">{t("placeholders.upazila")}</option>
              {upazilas.items.map((d) => <option key={d.id} value={d.nameEn}>{label(d)}</option>)}
            </GlassSelect>
          )}
        </GlassField>

        <GlassField label={t("fields.union")} htmlFor="union" error={err("union")}>
          <GlassInput id="union" icon={MapPin} autoComplete="address-level3" placeholder={t("placeholders.union")} invalid={!!errors.union} {...register("union")} />
        </GlassField>

        <GlassField label={t("fields.street")} htmlFor="street" error={err("street")}>
          <GlassInput id="street" icon={MapPin} autoComplete="street-address" placeholder={t("placeholders.street")} invalid={!!errors.street} {...register("street")} />
        </GlassField>

        <GlassField label={t("fields.postOffice")} htmlFor="postOffice" error={err("postOffice")}>
          <GlassInput id="postOffice" icon={MapPin} autoComplete="postal-code" placeholder={t("placeholders.postOffice")} invalid={!!errors.postOffice} {...register("postOffice")} />
        </GlassField>
      </div>
    </div>
  );
}
