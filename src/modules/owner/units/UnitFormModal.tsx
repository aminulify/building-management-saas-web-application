"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bath, Bed, Boxes, Building2, Check, ChevronDown, CookingPot, Home, Layers, Loader2, Pencil, Ruler, Settings2, Sofa, type LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { deriveFloor, unitFormSchema, type UnitFormValues } from "./schema";
import { Avatar, TenantPicker } from "./TenantPicker";
import type { OwnerProperty, TenantMatch, UnitRow } from "./types";

/** `add` opens an empty form, a row opens the edit form for that unit, null = closed. */
export type UnitFormTarget = "add" | UnitRow | null;

/** ৳ as an input icon (lucide has no taka sign). */
const TakaIcon = (({ className }: { className?: string }) => <span aria-hidden className={clsx("grid place-items-center text-lg font-bold leading-none", className)}>৳</span>) as unknown as LucideIcon;

interface Props { target: UnitFormTarget; properties: OwnerProperty[]; defaultPropertyId?: string; onClose: () => void; onSaved: () => void }

export function UnitFormModal({ target, properties, defaultPropertyId, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={target !== null} onClose={onClose} labelledBy="unit-form-title" busy={busy}>
      {target !== null && <Form target={target} properties={properties} defaultPropertyId={defaultPropertyId} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

const PLAN_CODES = ["PLAN_LIMIT_REACHED", "SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_GRACE_RESTRICTED"];

function Form({ target, properties, defaultPropertyId, onClose, onSaved, setBusy }: Props & { target: "add" | UnitRow; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.units.form");
  const v = useTranslations("validation");
  const toast = useToast();
  const editing = target === "add" ? null : target;

  const { register, handleSubmit, setError, setFocus, watch, formState: { errors } } = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema), mode: "onTouched",
    defaultValues: {
      propertyId: editing?.property.id ?? defaultPropertyId ?? (properties.length === 1 ? properties[0]!.id : ""),
      unitNumber: editing?.unitNumber ?? "",
      bedrooms: editing ? String(Math.min(5, Math.max(1, editing.bedrooms))) : "",
      sqft: editing?.areaSqft ? String(editing.areaSqft) : "",
      rent: editing ? String(Number(editing.rent)) : "",
      floor: editing ? String(editing.floor) : "", bathrooms: editing ? String(editing.bathrooms) : "1",
      diningRooms: editing ? String(editing.diningRooms) : "1", kitchens: editing ? String(editing.kitchens) : "1",
    },
  });
  const [tenant, setTenant] = useState<TenantMatch | null>(null);
  const [vacancy, setVacancy] = useState<"AVAILABLE" | "MAINTENANCE">(editing?.availability === "MAINTENANCE" ? "MAINTENANCE" : "AVAILABLE");
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ text: string; upgrade?: boolean } | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  useEffect(() => { setBusy(saving); }, [saving, setBusy]);
  useEffect(() => { const id = setTimeout(() => setFocus(editing ? "unitNumber" : properties.length === 1 ? "unitNumber" : "propertyId"), 140); return () => clearTimeout(id); }, [setFocus, editing, properties.length]);

  const propertyId = watch("propertyId");
  const property = useMemo(() => properties.find((p) => p.id === propertyId), [properties, propertyId]);
  const canPickTenant = !editing || (editing.availability === "AVAILABLE" && !editing.tenant);
  const isOccupied = editing?.availability === "OCCUPIED";

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    setSaving(true);
    const totalFloors = property?.totalFloors ?? editing?.property.totalFloors ?? 1;
    const floor = f.floor.trim() === "" ? deriveFloor(f.unitNumber, totalFloors) : Number(f.floor);
    try {
      let unitId = editing?.id ?? "";
      if (editing) {
        const patch: Record<string, unknown> = {};
        if (f.unitNumber.trim() !== editing.unitNumber) patch.unitNumber = f.unitNumber.trim();
        if (Number(f.bedrooms) !== Math.min(5, Math.max(1, editing.bedrooms))) patch.bedrooms = Number(f.bedrooms); // keeps 6+ untouched
        if (Number(f.sqft) !== editing.areaSqft) patch.areaSqft = Number(f.sqft);
        if (Number(f.rent) !== Number(editing.rent)) patch.rent = Number(f.rent);
        if (f.floor.trim() !== "" && floor !== editing.floor) patch.floor = floor;
        if (Number(f.bathrooms) !== editing.bathrooms) patch.bathrooms = Number(f.bathrooms);
        if (Number(f.diningRooms) !== editing.diningRooms) patch.diningRooms = Number(f.diningRooms);
        if (Number(f.kitchens) !== editing.kitchens) patch.kitchens = Number(f.kitchens);
        if (!isOccupied && vacancy !== (editing.availability === "MAINTENANCE" ? "MAINTENANCE" : "AVAILABLE")) patch.availability = vacancy;
        if (Object.keys(patch).length) await authApi(`/units/${editing.id}`, { method: "PATCH", body: patch });
        if (tenant) await authApi(`/units/${editing.id}/tenant`, { method: "POST", body: { tenantId: tenant.id } });
      } else {
        const res = await authApi<{ id: string }>(`/properties/${f.propertyId}/units`, {
          method: "POST",
          body: {
            unitNumber: f.unitNumber.trim(), floor, bedrooms: Number(f.bedrooms), bathrooms: Number(f.bathrooms), diningRooms: Number(f.diningRooms), kitchens: Number(f.kitchens),
            areaSqft: Number(f.sqft), rent: Number(f.rent), ...(tenant ? { tenantId: tenant.id } : {}),
          },
        });
        unitId = res.id;
      }
      void unitId;
      toast("success", editing ? t("updated") : tenant ? t("createdOccupied", { name: tenant.fullName }) : t("created"));
      onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      if (!(e instanceof ApiError)) { setBanner({ text: t("errors.generic") }); return; }
      const issue = e.issues[0];
      if (e.code === "CONFLICT" && e.field === "unitNumber") { setError("unitNumber", { message: "unitDuplicate" }); setFocus("unitNumber"); }
      else if (e.code === "VALIDATION_ERROR" && issue?.code === "exceeds_total_floors") { setMore(true); setError("floor", { message: "floorTooHigh" }); }
      else if (e.code === "VALIDATION_ERROR" && issue?.code === "not_a_tenant") setBanner({ text: t("errors.notATenant") });
      else if (PLAN_CODES.includes(e.code)) setBanner({ text: t(`errors.${e.code}` as never), upgrade: true });
      else if (e.code === "INVALID_STATE" && e.reason === "tenant_has_active_tenancy") setBanner({ text: t("errors.tenantBusy") });
      else if (e.code === "INVALID_STATE" && (e.reason === "unit_not_available" || e.reason === "occupied")) setBanner({ text: t("errors.unitTaken") });
      else if (e.code === "INVALID_STATE" && e.reason === "property_not_active") setBanner({ text: t("errors.propertyInactive") });
      else if (e.code === "RATE_LIMITED") setBanner({ text: t("errors.rateLimited") });
      else if (e.code === "NETWORK") setBanner({ text: t("errors.network") });
      else if (e.code === "FORBIDDEN" || e.code === "ACCOUNT_SUSPENDED") setBanner({ text: t("errors.forbidden") });
      else setBanner({ text: t("errors.generic") });
    }
  });

  const bedroomLabel = (n: number) => (n === 1 ? t("bedroomOne") : n === 5 ? t("bedroomFivePlus") : t("bedroomMany", { n }));
  const small = (name: "bathrooms" | "diningRooms" | "kitchens" | "floor", icon: LucideIcon, label: string) => (
    <GlassField label={label} htmlFor={`u-${name}`} error={msg(errors[name]?.message)}>
      <GlassInput id={`u-${name}`} icon={icon} inputMode="numeric" disabled={saving} placeholder={name === "floor" ? t("floorAuto") : "1"} invalid={!!errors[name]} {...register(name)} />
    </GlassField>
  );

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]">{editing ? <Pencil className="size-5" /> : <Boxes className="size-5" />}</span>
        <h2 id="unit-form-title" className="text-xl font-bold text-navy sm:text-2xl">{editing ? t("editTitle") : t("addTitle")}</h2>
      </header>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <GlassField label={t("fields.property")} htmlFor="u-property" error={msg(errors.propertyId?.message)}>
          <GlassSelect id="u-property" icon={Building2} invalid={!!errors.propertyId} disabled={saving || !!editing} {...register("propertyId")}>
            <option value="">{t("placeholders.property")}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </GlassSelect>
        </GlassField>

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.name")} htmlFor="u-name" error={msg(errors.unitNumber?.message)}>
            <GlassInput id="u-name" icon={Home} autoComplete="off" placeholder={t("placeholders.name")} invalid={!!errors.unitNumber} disabled={saving} {...register("unitNumber")} />
          </GlassField>
          <GlassField label={t("fields.bedrooms")} htmlFor="u-bedrooms" error={msg(errors.bedrooms?.message)}>
            <GlassSelect id="u-bedrooms" icon={Bed} invalid={!!errors.bedrooms} disabled={saving} {...register("bedrooms")}>
              <option value="">{t("placeholders.bedrooms")}</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{bedroomLabel(n)}</option>)}
            </GlassSelect>
          </GlassField>
        </div>

        <div>
          <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-label">{t("fields.tenant")}</p>
          {canPickTenant ? (
            <>
              <TenantPicker value={tenant} onChange={setTenant} disabled={saving} label={t("fields.tenant")} />
              <p className="mt-1.5 text-xs text-label">{tenant ? t("willBeOccupied") : t("willBeVacant")}</p>
            </>
          ) : editing?.tenant ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <Avatar name={editing.tenant.fullName} url={editing.tenant.avatarUrl} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-navy">{editing.tenant.fullName}</p><p className="text-xs text-slate-600">{editing.tenant.phone}</p></div>
              <Link href={"/home-owner/tenants" as never} className="text-xs font-bold text-[#0A84F0] underline underline-offset-2">{t("manageTenant")}</Link>
            </div>
          ) : <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-label">{t("tenantLocked")}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.sqft")} htmlFor="u-sqft" error={msg(errors.sqft?.message)}>
            <GlassInput id="u-sqft" icon={Ruler} inputMode="numeric" placeholder={t("placeholders.sqft")} invalid={!!errors.sqft} disabled={saving} {...register("sqft")} />
          </GlassField>
          <GlassField label={t("fields.rent")} htmlFor="u-rent" error={msg(errors.rent?.message)}>
            <GlassInput id="u-rent" icon={TakaIcon} inputMode="decimal" placeholder={t("placeholders.rent")} invalid={!!errors.rent} disabled={saving} {...register("rent")} />
          </GlassField>
        </div>

        <div>
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex items-center gap-1.5 text-sm font-semibold text-[#0A84F0] transition-opacity hover:opacity-80">
            <Settings2 className="size-4" aria-hidden />{t("moreDetails")}<ChevronDown className={clsx("size-4 transition-transform duration-300", more && "rotate-180")} aria-hidden />
          </button>
          {more && (
            <div className="mt-3 space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
              <div className="grid gap-4 sm:grid-cols-2">{small("floor", Layers, t("fields.floor"))}{small("bathrooms", Bath, t("fields.bathrooms"))}</div>
              <div className="grid gap-4 sm:grid-cols-2">{small("diningRooms", Sofa, t("fields.dining"))}{small("kitchens", CookingPot, t("fields.kitchens"))}</div>
              {editing && !isOccupied && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("fields.status")}</p>
                  <div role="radiogroup" aria-label={t("fields.status")} className="grid grid-cols-2 gap-2">
                    {(["AVAILABLE", "MAINTENANCE"] as const).map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={vacancy === s} onClick={() => setVacancy(s)}
                        className={clsx("rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-300", vacancy === s ? (s === "AVAILABLE" ? "border-pink-300 bg-pink-50 text-pink-700" : "border-amber-300 bg-amber-50 text-amber-700") : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                        {t(s === "AVAILABLE" ? "statusVacant" : "statusMaintenance")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isOccupied && <p className="text-xs text-label">{t("occupiedNote")}</p>}
            </div>
          )}
        </div>

        {banner && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{banner.text}{banner.upgrade && <> <Link href={"/home-owner/subscription" as never} className="font-bold underline underline-offset-2">{t("viewPlans")}</Link></>}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{saving ? t("saving") : editing ? t("saveChanges") : t("save")}
          </button>
        </div>
      </form>
    </>
  );
}
