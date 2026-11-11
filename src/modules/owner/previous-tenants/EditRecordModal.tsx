"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Calendar, Check, DoorOpen, Loader2, Pencil, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { Avatar } from "../units/TenantPicker";
import { dayAfter, todayInput, toDateInput } from "../tenants/schema";
import { BEHAVIORS, LEAVE_REASONS, editRecordSchema, recordPatch, type EditRecordValues } from "./logic";
import type { PastRow } from "./types";

interface Props { row: PastRow | null; onClose: () => void; onSaved: () => void }

export function EditRecordModal({ row, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={row !== null} onClose={onClose} labelledBy="edit-past-title" busy={busy} maxWidth="max-w-[560px]">
      {row && <Form row={row} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Form({ row, onClose, onSaved, setBusy }: { row: PastRow; onClose: () => void; onSaved: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.previousTenants.edit");
  const rt = useTranslations("owner.previousTenants");
  const v = useTranslations("validation");
  const toast = useToast();
  const { register, handleSubmit, setError, watch, formState: { errors } } = useForm<EditRecordValues>({
    resolver: zodResolver(editRecordSchema), mode: "onTouched",
    defaultValues: { leaveReason: row.leaveReason ?? "", behavior: row.behavior ?? "", startDate: toDateInput(row.startDate), endDate: toDateInput(row.endDate), ownerNotes: row.ownerNotes ?? "" },
  });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const start = watch("startDate");
  const notes = watch("ownerNotes") ?? "";
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    const patch = recordPatch(f, row);
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await authApi(`/tenancies/${row.id}/record`, { method: "PATCH", body: patch });
      toast("success", t("done", { name: row.tenant?.fullName ?? "" }));
      onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      const code = e instanceof ApiError ? e.issues[0]?.code : undefined;
      if (e instanceof ApiError && e.code === "VALIDATION_ERROR" && code === "end_after_start") setError("endDate", { message: "leaseAfterEntry" });
      else if (e instanceof ApiError && e.code === "VALIDATION_ERROR" && code === "not_in_future") setError("endDate", { message: "notInFuture" });
      else if (e instanceof ApiError && (e.code === "NOT_FOUND" || e.code === "INVALID_STATE")) setBanner(t("errors.gone"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Pencil className="size-5" /></span>
        <div><h2 id="edit-past-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{row.property.name} · {rt("unit", { no: row.unit.unitNumber })}</p></div>
      </header>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5"><Avatar name={row.tenant?.fullName ?? "?"} url={row.tenant?.avatarUrl} /><p className="font-bold text-navy">{row.tenant?.fullName}</p></div>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.reason")} htmlFor="p-reason" error={msg(errors.leaveReason?.message)}>
            <GlassSelect id="p-reason" icon={DoorOpen} disabled={saving} {...register("leaveReason")}>
              <option value="">{t("notSet")}</option>
              {LEAVE_REASONS.map((k) => <option key={k} value={k}>{rt(`reason.${k}`)}</option>)}
            </GlassSelect>
          </GlassField>
          <GlassField label={t("fields.behavior")} htmlFor="p-behavior" error={msg(errors.behavior?.message)}>
            <GlassSelect id="p-behavior" icon={Star} disabled={saving} {...register("behavior")}>
              <option value="">{rt("behavior.UNRATED")}</option>
              {BEHAVIORS.map((k) => <option key={k} value={k}>{rt(`behavior.${k}`)}</option>)}
            </GlassSelect>
          </GlassField>
        </div>

        <div>
          <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-label">{t("fields.period")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <GlassField label={t("fields.moveIn")} htmlFor="p-start" error={msg(errors.startDate?.message)}>
              <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={errors.startDate ? true : undefined}>
                <Calendar className="size-5 shrink-0 text-slate-400" aria-hidden />
                <input id="p-start" type="date" max={todayInput()} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("startDate")} />
              </div>
            </GlassField>
            <GlassField label={t("fields.moveOut")} htmlFor="p-end" error={msg(errors.endDate?.message)}>
              <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={errors.endDate ? true : undefined}>
                <Calendar className="size-5 shrink-0 text-slate-400" aria-hidden />
                <input id="p-end" type="date" min={start ? dayAfter(start) : undefined} max={todayInput()} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("endDate")} />
              </div>
            </GlassField>
          </div>
        </div>

        <GlassField label={t("fields.notes")} htmlFor="p-notes" error={msg(errors.ownerNotes?.message)} hint={t("notesHint", { n: notes.length })}>
          <textarea id="p-notes" rows={3} maxLength={1000} disabled={saving} placeholder={t("notesPlaceholder")} aria-invalid={!!errors.ownerNotes || undefined}
            className="glass-input block w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-300" {...register("ownerNotes")} />
        </GlassField>

        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}

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
