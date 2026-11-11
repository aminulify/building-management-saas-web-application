"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Briefcase, Calendar, Check, Loader2, MapPin, Pencil, Phone, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { profileFormSchema, profilePatch, type ProfileFormValues } from "./logic";
import type { OwnerOverview } from "./types";

interface Props { data: OwnerOverview | null; open: boolean; onClose: () => void; onSaved: (fullName: string) => void }

export function EditProfileModal({ data, open, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-profile-title" busy={busy} maxWidth="max-w-[620px]">
      {open && data && <Form data={data} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ data, onClose, onSaved, setBusy }: { data: OwnerOverview; onClose: () => void; onSaved: (n: string) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.profile.edit");
  const v = useTranslations("validation");
  const toast = useToast();
  const { user, address: a } = data;
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema), mode: "onTouched",
    defaultValues: { fullName: user.fullName, phone: user.phone ?? "", occupation: user.occupation ?? "", dateOfBirth: user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : "", division: a?.division ?? "", district: a?.district ?? "", upazila: a?.upazila ?? "", union: a?.union ?? "", street: a?.street ?? "", postOffice: a?.postOffice ?? "", bkashNumber: user.bkashNumber ?? "" },
  });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    const patch = profilePatch(f, { fullName: user.fullName, phone: user.phone, occupation: user.occupation, dateOfBirth: user.dateOfBirth, bkashNumber: user.bkashNumber, address: a as Record<string, string | null> | null });
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await authApi("/me", { method: "PATCH", body: patch });
      toast("success", t("done"));
      onSaved(f.fullName.trim());
      onClose();
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "CONFLICT") setError("phone", { message: "phoneTaken" });
      else if (e instanceof ApiError && e.code === "VALIDATION_ERROR") setBanner(t("errors.invalid"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  const field = (id: keyof ProfileFormValues, icon: typeof User, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <GlassField label={t(`fields.${id}`)} htmlFor={`p-${id}`} error={msg(errors[id]?.message as string | undefined)}>
      <GlassInput id={`p-${id}`} icon={icon} invalid={!!errors[id]} disabled={saving} {...register(id)} {...extra} />
    </GlassField>
  );

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Pencil className="size-5" /></span>
        <div><h2 id="edit-profile-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("locked")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("fullName", User)}
          {field("phone", Phone, { inputMode: "tel" })}
          {field("occupation", Briefcase)}
          <GlassField label={t("fields.dateOfBirth")} htmlFor="p-dateOfBirth" error={msg(errors.dateOfBirth?.message)}>
            <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={errors.dateOfBirth ? true : undefined}>
              <Calendar className="size-5 shrink-0 text-slate-400" aria-hidden />
              <input id="p-dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("dateOfBirth")} />
            </div>
          </GlassField>
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
        <div>
          {field("bkashNumber", Phone, { inputMode: "tel", placeholder: "01XXXXXXXXX" })}
          <p className="mt-1.5 text-xs text-label">{t("bkashHint")}</p>
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
