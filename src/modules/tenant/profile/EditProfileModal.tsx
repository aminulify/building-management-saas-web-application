"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Briefcase, Calendar, Check, Fingerprint, Hash, Loader2, Lock, Mail, MapPin, Pencil, Phone, User, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formFrom, profileFormSchema, profilePatch, type ProfileFormValues } from "./logic";
import type { TenantOverview } from "./types";

interface Props { data: TenantOverview | null; open: boolean; onClose: () => void; onSaved: (fullName: string) => void }

/** "Update Profile": every field of the profile page, with the Tenant ID shown locked (it can never change). */
export function EditProfileModal({ data, open, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="tp-edit-title" busy={busy} maxWidth="max-w-[640px]">
      {open && data && <Form data={data} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ data, onClose, onSaved, setBusy }: { data: TenantOverview; onClose: () => void; onSaved: (n: string) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.profile.edit");
  const v = useTranslations("validation");
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ProfileFormValues>({ resolver: zodResolver(profileFormSchema), mode: "onTouched", defaultValues: formFrom(data) });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    const patch = profilePatch(f, data);
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await authApi("/me", { method: "PATCH", body: patch });
      toast("success", t("done"));
      onSaved(f.fullName.trim());
      onClose();
    } catch (e) {
      setSaving(false);
      const field = e instanceof ApiError && e.code === "CONFLICT" ? (e.details as { field?: string } | undefined)?.field : undefined;
      if (field === "email") setError("email", { message: "emailTaken" });
      else if (field === "nid") setError("nid", { message: "nidTaken" });
      else if (e instanceof ApiError && e.code === "CONFLICT") setError("phone", { message: "phoneTaken" });
      else if (e instanceof ApiError && e.code === "VALIDATION_ERROR") setBanner(t("errors.invalid"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  // muted, not editable: Tenant ID and username never change; a verified tenant's NID number is fixed too
  const locked = (id: string, label: string, icon: typeof User, value: string, hint: string) => {
    const Icon = icon;
    return (
      <GlassField label={label} htmlFor={`tp-${id}`} hint={hint}>
        <div className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-slate-100/80 px-3 text-slate-500" aria-disabled="true">
          <Icon className="size-5 shrink-0 text-slate-400" aria-hidden />
          <input id={`tp-${id}`} value={value} readOnly disabled className="h-full min-w-0 flex-1 cursor-not-allowed bg-transparent text-[0.95rem] font-bold text-slate-500 outline-none" />
          <Lock className="size-4 shrink-0 text-slate-400" aria-hidden />
        </div>
      </GlassField>
    );
  };
  const field = (id: keyof ProfileFormValues, icon: typeof User, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <GlassField label={t(`fields.${id}`)} htmlFor={`tp-${id}`} error={msg(errors[id]?.message as string | undefined)}>
      <GlassInput id={`tp-${id}`} icon={icon} invalid={!!errors[id]} disabled={saving} {...register(id)} {...extra} />
    </GlassField>
  );

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Pencil className="size-5" /></span>
        <div><h2 id="tp-edit-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("fullName", User, { autoComplete: "name" })}
          {field("phone", Phone, { inputMode: "tel", autoComplete: "tel" })}
          {field("email", Mail, { type: "email", autoComplete: "email" })}
          {field("occupation", Briefcase)}
          {data.user.role === "TENANT" ? locked("nid", t("fields.nid"), Fingerprint, data.user.nid ?? "—", t("nidHint")) : field("nid", Fingerprint, { inputMode: "numeric" })}
          <GlassField label={t("fields.dateOfBirth")} htmlFor="tp-dateOfBirth" error={msg(errors.dateOfBirth?.message)}>
            <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={errors.dateOfBirth ? true : undefined}>
              <Calendar className="size-5 shrink-0 text-slate-400" aria-hidden />
              <input id="tp-dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("dateOfBirth")} />
            </div>
          </GlassField>
          {field("members", Users, { inputMode: "numeric" })}
          {locked("tenantId", t("fields.tenantId"), Hash, data.user.tenantCode, t("tenantIdHint"))}
          {locked("username", t("fields.username"), User, `@${data.user.username}`, t("usernameHint"))}
        </div>
        <p className="flex items-center gap-2 pt-1 text-xs font-bold uppercase tracking-wider text-label"><MapPin className="size-4" aria-hidden />{t("address")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("division", MapPin)}
          {field("district", MapPin)}
          {field("upazila", MapPin)}
          {field("union", MapPin)}
          {field("street", MapPin)}
          {field("postOffice", MapPin)}
        </div>
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{saving ? t("saving") : t("save")}</button>
        </div>
      </form>
    </>
  );
}
