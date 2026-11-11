"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Boxes, Building2, Calendar, Check, Loader2, UserPlus, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatTaka } from "../dashboard/format";
import { TenantPicker } from "../units/TenantPicker";
import type { OwnerProperty, TenantMatch, UnitsPage } from "../units/types";
import { addTenantSchema, dayAfter, todayInput, type AddTenantValues } from "./schema";

interface Props { open: boolean; properties: OwnerProperty[]; propertiesState: "loading" | "ready" | "error"; onRetryProperties: () => void; onClose: () => void; onSaved: () => void }

export function AddTenantModal({ open, properties, propertiesState, onRetryProperties, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="add-tenant-title" busy={busy} maxWidth="max-w-[580px]">
      {open && <Form properties={properties} propertiesState={propertiesState} onRetryProperties={onRetryProperties} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

const PLAN_CODES = ["PLAN_LIMIT_REACHED", "SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_GRACE_RESTRICTED"];

function Form({ properties, propertiesState, onRetryProperties, onClose, onSaved, setBusy }: Omit<Props, "open"> & { setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.tenants.add");
  const v = useTranslations("validation");
  const locale = useLocale();
  const toast = useToast();
  const { register, handleSubmit, setValue, watch, setError, formState: { errors } } = useForm<AddTenantValues>({
    resolver: zodResolver(addTenantSchema), mode: "onTouched",
    defaultValues: { tenantId: "", propertyId: properties.length === 1 ? properties[0]!.id : "", unitId: "", startDate: todayInput(), endDate: "", members: "" },
  });
  const [tenant, setTenant] = useState<TenantMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ text: string; upgrade?: boolean } | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const propertyId = watch("propertyId");
  const unitId = watch("unitId");
  const startDate = watch("startDate");
  // vacant units of the chosen property (a unit under maintenance is not listed: it cannot take a tenant)
  const units = useAuthQuery<UnitsPage>(propertyId ? `/units?propertyId=${propertyId}&status=VACANT&pageSize=50` : null);
  const vacant = useMemo(() => (units.data?.items ?? []).filter((u) => u.availability === "AVAILABLE"), [units.data]);
  const unit = vacant.find((u) => u.id === unitId);

  useEffect(() => { setValue("unitId", ""); }, [propertyId, setValue]);
  useEffect(() => { setValue("tenantId", tenant?.id ?? "", { shouldValidate: !!tenant }); }, [tenant, setValue]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    setSaving(true);
    try {
      await authApi(`/units/${f.unitId}/tenant`, { method: "POST", body: { tenantId: f.tenantId, startDate: f.startDate, endDate: f.endDate, members: Number(f.members) } });
      toast("success", t("done", { name: tenant?.fullName ?? "", unit: unit?.unitNumber ?? "" }));
      onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      if (!(e instanceof ApiError)) { setBanner({ text: t("errors.generic") }); return; }
      if (e.code === "VALIDATION_ERROR" && e.issues[0]?.code === "end_after_start") setError("endDate", { message: "leaseAfterEntry" });
      else if (e.code === "VALIDATION_ERROR") setBanner({ text: t("errors.notATenant") });
      else if (PLAN_CODES.includes(e.code)) setBanner({ text: t(`errors.${e.code}` as never), upgrade: true });
      else if (e.code === "INVALID_STATE" && e.reason === "tenant_has_active_tenancy") setBanner({ text: t("errors.tenantBusy") });
      else if (e.code === "INVALID_STATE") { setBanner({ text: t("errors.unitTaken") }); units.reload(); }
      else if (e.code === "RATE_LIMITED") setBanner({ text: t("errors.rateLimited") });
      else if (e.code === "NETWORK") setBanner({ text: t("errors.network") });
      else if (e.code === "FORBIDDEN" || e.code === "ACCOUNT_SUSPENDED") setBanner({ text: t("errors.forbidden") });
      else setBanner({ text: t("errors.generic") });
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><UserPlus className="size-5" /></span>
        <h2 id="add-tenant-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
      </header>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div>
          <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-label">{t("fields.find")}</p>
          <TenantPicker value={tenant} onChange={setTenant} disabled={saving} allowEmail autoFocus label={t("fields.find")} />
          {errors.tenantId && !tenant && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5 shrink-0" aria-hidden />{msg(errors.tenantId.message)}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.property")} htmlFor="t-property" error={msg(errors.propertyId?.message)}>
            <GlassSelect id="t-property" icon={Building2} invalid={!!errors.propertyId} loading={propertiesState === "loading"} disabled={saving || propertiesState !== "ready"} {...register("propertyId")}>
              <option value="">{propertiesState === "loading" ? t("placeholders.propertyLoading") : propertiesState === "error" ? t("propertiesError") : properties.length === 0 ? t("noProperties") : t("placeholders.property")}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </GlassSelect>
          </GlassField>
          <GlassField label={t("fields.unit")} htmlFor="t-unit" error={msg(errors.unitId?.message)}>
            <GlassSelect id="t-unit" icon={Boxes} invalid={!!errors.unitId} loading={!!propertyId && units.state === "loading"} disabled={saving || !propertyId || units.state !== "ready" || vacant.length === 0} {...register("unitId")}>
              <option value="">{!propertyId ? t("placeholders.unitFirst") : units.state === "loading" ? t("placeholders.unitLoading") : vacant.length === 0 && units.state === "ready" ? t("noVacant") : t("placeholders.unit")}</option>
              {vacant.map((u) => <option key={u.id} value={u.id}>{t("unitOption", { no: u.unitNumber })}</option>)}
            </GlassSelect>
          </GlassField>
        </div>
        {propertiesState === "error" && <p role="alert" className="-mt-2 text-xs font-medium text-red-600">{t("propertiesError")} <button type="button" onClick={onRetryProperties} className="font-bold underline underline-offset-2">{t("retry")}</button></p>}
        {propertiesState === "ready" && properties.length === 0 && <p className="-mt-2 text-xs text-amber-700">{t("noPropertiesHelp")} <Link href={"/home-owner/properties" as never} className="font-bold underline underline-offset-2">{t("goProperties")}</Link></p>}
        {propertyId && units.state === "error" && <p role="alert" className="-mt-2 text-xs font-medium text-red-600">{t("unitsError")} <button type="button" onClick={units.reload} className="font-bold underline underline-offset-2">{t("retry")}</button></p>}
        {propertyId && units.state === "ready" && vacant.length === 0 && (
          <p className="-mt-2 text-xs text-amber-700">{t("noVacantHelp")} <Link href={"/home-owner/units" as never} className="font-bold underline underline-offset-2">{t("goUnits")}</Link></p>
        )}
        {unit && <p className="-mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">{t("rentInfo", { rent: formatTaka(locale)(Number(unit.rent)) })}</p>}

        <div>
          <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-label">{t("fields.dates")}</p>
          <div className="glass-input grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-3 py-1.5" data-invalid={errors.startDate || errors.endDate ? true : undefined}>
            <label className="flex min-w-0 items-center gap-2"><Calendar className="size-5 shrink-0 text-slate-400" aria-hidden /><span className="sr-only">{t("fields.entry")}</span>
              <input type="date" disabled={saving} aria-label={t("fields.entry")} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("startDate")} />
            </label>
            <ArrowRight className="size-4 text-slate-400" aria-hidden />
            <label className="flex min-w-0 items-center gap-2"><span className="sr-only">{t("fields.lease")}</span>
              <input type="date" min={startDate ? dayAfter(startDate) : undefined} disabled={saving} aria-label={t("fields.lease")} className="h-10 min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("endDate")} />
            </label>
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-[11px] font-medium text-label"><span>{t("fields.entry")}</span><span>{t("fields.lease")}</span></div>
          {(errors.startDate || errors.endDate) && <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{msg(errors.startDate?.message ?? errors.endDate?.message)}</p>}
        </div>

        <GlassField label={t("fields.members")} htmlFor="t-members" error={msg(errors.members?.message)}>
          <GlassInput id="t-members" icon={Users} inputMode="numeric" placeholder={t("placeholders.members")} invalid={!!errors.members} disabled={saving} {...register("members")} />
        </GlassField>

        {banner && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{banner.text}{banner.upgrade && <> <Link href={"/home-owner/subscription" as never} className="font-bold underline underline-offset-2">{t("viewPlans")}</Link></>}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{saving ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
