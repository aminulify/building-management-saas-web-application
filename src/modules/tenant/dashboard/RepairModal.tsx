"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, ClipboardList, Flag, Loader2, Send, Tag, Wrench } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { uploadPrivate } from "../../owner/profile/upload";
import { PhotoPicker } from "./PhotoPicker";
import { PRIORITIES, REPAIR_CATEGORIES, repairFormSchema, repairStep, type RepairFormValues } from "./logic";
import type { RepairStatus } from "./types";

interface Props { open: boolean; onClose: () => void; onSent: () => void }

export function RepairModal({ open, onClose, onSent }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="repair-title" busy={busy} maxWidth="max-w-[560px]">
      {open && <Body onClose={onClose} onSent={onSent} setBusy={setBusy} />}
    </Modal>
  );
}

/** Pending → In Progress → Completed, refreshed every few seconds while the window is open. */
export function Tracker({ id }: { id: string }) {
  const t = useTranslations("tenant.dashboard.repair");
  const [status, setStatus] = useState<RepairStatus>("PENDING");
  useEffect(() => {
    let live = true;
    const load = () => authApi<{ status: RepairStatus }>(`/maintenance/${id}`).then((r) => { if (live) setStatus(r.status); }).catch(() => undefined);
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000);
    return () => { live = false; clearInterval(timer); };
  }, [id]);
  const step = repairStep(status);
  const steps = ["pending", "inProgress", "completed"] as const;
  return (
    <div role="status" aria-live="polite">
      {step === null ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{t(status === "REJECTED" ? "rejected" : "cancelled")}</p> : (
        <ol className="flex items-center">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-500", i <= step ? "bg-brand-gradient text-white" : "bg-slate-200 text-slate-500")}>{i < step ? <Check className="size-4" aria-hidden /> : i + 1}</span>
              <span className={clsx("ml-2 text-xs font-semibold", i <= step ? "text-navy" : "text-slate-400")}>{t(`steps.${s}`)}</span>
              {i < 2 && <span aria-hidden className={clsx("mx-2 h-0.5 flex-1 rounded-full transition-colors duration-500", i < step ? "bg-[#9B5CF0]" : "bg-slate-200")} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Body({ onClose, onSent, setBusy }: { onClose: () => void; onSent: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.dashboard.repair");
  const v = useTranslations("validation");
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<RepairFormValues>({ resolver: zodResolver(repairFormSchema), mode: "onTouched", defaultValues: { category: "PLUMBING", priority: "MEDIUM", title: "", description: "" } });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      const images = await Promise.all(files.map((file) => uploadPrivate("MAINTENANCE_IMAGE", file, file.type)));
      const r = await authApi<{ id: string }>("/maintenance", { method: "POST", body: { ...f, images } });
      toast("success", t("done"));
      setSent(r.id); setSaving(false); onSent();
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "INVALID_STATE") setBanner(t("errors.noLease"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  if (sent) {
    return (
      <div>
        <h2 id="repair-title" className="pr-10 text-xl font-bold text-navy sm:text-2xl">{t("sentTitle")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("sentText")}</p>
        <div className="mt-5 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md"><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-label">{t("track")}</p><Tracker id={sent} /></div>
        <div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="btn btn-primary h-12 min-w-32">{t("close")}</button></div>
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_-8px_rgba(16,185,129,0.7)]"><Wrench className="size-5" /></span>
        <div><h2 id="repair-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-5 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("category")} htmlFor="rp-category" error={msg(errors.category?.message)}>
            <GlassSelect id="rp-category" icon={Tag} disabled={saving} {...register("category")}>{REPAIR_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}</GlassSelect>
          </GlassField>
          <GlassField label={t("priority")} htmlFor="rp-priority" error={msg(errors.priority?.message)}>
            <GlassSelect id="rp-priority" icon={Flag} disabled={saving} {...register("priority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priorities.${p}`)}</option>)}</GlassSelect>
          </GlassField>
        </div>
        <GlassField label={t("titleLabel")} htmlFor="rp-title" error={msg(errors.title?.message)}>
          <GlassInput id="rp-title" icon={ClipboardList} placeholder={t("titlePlaceholder")} invalid={!!errors.title} disabled={saving} data-autofocus {...register("title")} />
        </GlassField>
        <GlassField label={t("description")} htmlFor="rp-desc" error={msg(errors.description?.message)}>
          <textarea id="rp-desc" rows={4} disabled={saving} placeholder={t("descriptionPlaceholder")} aria-invalid={!!errors.description || undefined} className="glass-input block w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-300" {...register("description")} />
        </GlassField>
        <PhotoPicker files={files} onChange={setFiles} disabled={saving} label={t("photos")} onProblem={(k) => setBanner(t(`errors.photo.${k}`))} />
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-48">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{saving ? t("sending") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
