"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, ClipboardList, Loader2, Send, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { uploadPrivate } from "../../owner/profile/upload";
import { PhotoPicker } from "./PhotoPicker";
import { INCIDENT_CATEGORIES, incidentFormSchema, type IncidentFormValues } from "./logic";

interface Props { open: boolean; propertyId: string | null; onClose: () => void; onSent: () => void }

/** Urgent security or noise report: goes to the owner at once (and to the AmaderGhor team). */
export function IncidentModal({ open, propertyId, onClose, onSent }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="inc-title" busy={busy} maxWidth="max-w-[540px]">
      {open && <Form propertyId={propertyId} onClose={onClose} onSent={onSent} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ propertyId, onClose, onSent, setBusy }: { propertyId: string | null; onClose: () => void; onSent: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.dashboard.incident");
  const v = useTranslations("validation");
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<IncidentFormValues>({ resolver: zodResolver(incidentFormSchema), mode: "onTouched", defaultValues: { category: "SECURITY", subject: "", description: "" } });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      const evidence = await Promise.all(files.map((file) => uploadPrivate("COMPLAINT_EVIDENCE", file, file.type)));
      await authApi("/complaints", { method: "POST", body: { ...f, propertyId: propertyId ?? undefined, evidence } });
      toast("success", t("done"));
      onSent(); onClose();
    } catch (e) {
      setSaving(false);
      setBanner(t(e instanceof ApiError && e.code === "NETWORK" ? "errors.network" : "errors.generic"));
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-500 text-white shadow-[0_8px_20px_-8px_rgba(239,68,68,0.7)]"><AlertTriangle className="size-5" /></span>
        <div><h2 id="inc-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <GlassField label={t("category")} htmlFor="in-category" error={msg(errors.category?.message)}>
          <GlassSelect id="in-category" icon={Tag} disabled={saving} {...register("category")}>{INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}</GlassSelect>
        </GlassField>
        <GlassField label={t("subject")} htmlFor="in-subject" error={msg(errors.subject?.message)}>
          <GlassInput id="in-subject" icon={ClipboardList} placeholder={t("subjectPlaceholder")} invalid={!!errors.subject} disabled={saving} data-autofocus {...register("subject")} />
        </GlassField>
        <GlassField label={t("description")} htmlFor="in-desc" error={msg(errors.description?.message)}>
          <textarea id="in-desc" rows={4} disabled={saving} placeholder={t("descriptionPlaceholder")} aria-invalid={!!errors.description || undefined} className="glass-input block w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-300" {...register("description")} />
        </GlassField>
        <PhotoPicker files={files} onChange={setFiles} disabled={saving} label={t("photos")} onProblem={(k) => setBanner(t(`errors.photo.${k}`))} />
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-danger h-12 sm:min-w-48">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{saving ? t("sending") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
