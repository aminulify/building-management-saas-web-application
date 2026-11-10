"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Calendar, Check, Loader2, Pencil, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { Avatar } from "../units/TenantPicker";
import { dayAfter, editTenantSchema, toDateInput, type EditTenantValues } from "./schema";
import type { DirectoryRow } from "./types";

interface Props { row: DirectoryRow | null; onClose: () => void; onSaved: () => void }

export function EditTenantModal({ row, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={row !== null} onClose={onClose} labelledBy="edit-tenant-title" busy={busy} maxWidth="max-w-[540px]">
      {row && <Form row={row} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

/** ৳ as an input icon (lucide has no taka sign). */
const Taka = ({ className }: { className?: string }) => <span aria-hidden className={`grid place-items-center text-lg font-bold leading-none ${className ?? ""}`}>৳</span>;

function Form({ row, onClose, onSaved, setBusy }: { row: DirectoryRow; onClose: () => void; onSaved: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.tenants.edit");
  const v = useTranslations("validation");
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<EditTenantValues>({
    resolver: zodResolver(editTenantSchema), mode: "onTouched",
    defaultValues: { endDate: toDateInput(row.endDate), members: String(row.members), rent: String(Number(row.rent)), deposit: String(Number(row.deposit)) },
  });
  const [notice, setNotice] = useState(!!row.noticeGivenAt);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    const patch: Record<string, unknown> = {};
    if (f.endDate !== toDateInput(row.endDate)) patch.endDate = f.endDate;
    if (Number(f.members) !== row.members) patch.members = Number(f.members);
    if (Number(f.rent) !== Number(row.rent)) patch.rent = Number(f.rent);
    if (Number(f.deposit) !== Number(row.deposit)) patch.deposit = Number(f.deposit);
    if (notice !== !!row.noticeGivenAt) patch.noticeGiven = notice;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await authApi(`/tenancies/${row.id}`, { method: "PATCH", body: patch });
      toast("success", t("done", { name: row.tenant?.fullName ?? "" }));
      onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.code === "VALIDATION_ERROR" && e.issues[0]?.code === "end_after_start") setError("endDate", { message: "leaseAfterEntry" });
      else if (e instanceof ApiError && e.code === "INVALID_STATE") setBanner(t("errors.ended"));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  return (
    <>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Pencil className="size-5" /></span>
        <div><h2 id="edit-tenant-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
          <p className="text-xs text-slate-600">{row.property.name} · {t("unit", { no: row.unit.unitNumber })}</p></div>
      </header>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5"><Avatar name={row.tenant?.fullName ?? "?"} url={row.tenant?.avatarUrl} /><p className="font-bold text-navy">{row.tenant?.fullName}</p></div>

      <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-4" aria-busy={saving || undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassField label={t("fields.lease")} htmlFor="e-lease" error={msg(errors.endDate?.message)}>
            <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={errors.endDate ? true : undefined}>
              <Calendar className="size-5 shrink-0 text-slate-400" aria-hidden />
              <input id="e-lease" type="date" min={dayAfter(toDateInput(row.startDate))} disabled={saving} className="h-full min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" {...register("endDate")} />
            </div>
          </GlassField>
          <GlassField label={t("fields.members")} htmlFor="e-members" error={msg(errors.members?.message)}>
            <GlassInput id="e-members" icon={Users} inputMode="numeric" invalid={!!errors.members} disabled={saving} {...register("members")} />
          </GlassField>
          <GlassField label={t("fields.rent")} htmlFor="e-rent" error={msg(errors.rent?.message)}>
            <GlassInput id="e-rent" icon={Taka as never} inputMode="decimal" invalid={!!errors.rent} disabled={saving} {...register("rent")} />
          </GlassField>
          <GlassField label={t("fields.deposit")} htmlFor="e-deposit" error={msg(errors.deposit?.message)}>
            <GlassInput id="e-deposit" icon={Taka as never} inputMode="decimal" invalid={!!errors.deposit} disabled={saving} {...register("deposit")} />
          </GlassField>
        </div>
        <p className="-mt-1 text-xs text-label">{t("rentNote")}</p>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} disabled={saving} className="mt-1 size-4 accent-amber-500" />
          <span><span className="block text-sm font-semibold text-amber-900">{t("notice")}</span><span className="block text-xs text-amber-800/80">{t("noticeHelp")}</span></span>
        </label>

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
