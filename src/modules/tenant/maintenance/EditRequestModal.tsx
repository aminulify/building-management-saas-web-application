"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Check, Info, ListChecks, Loader2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassSelect } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { uploadPrivate } from "../../owner/profile/upload";
import { PhotoPicker } from "../dashboard/PhotoPicker";
import { ContextTags } from "./ContextTags";
import { RequestFields } from "./RequestFields";
import { MAX_PHOTOS, contentLocked, preferredIso, requestSchema, toLocalInput, uiStatus, type RequestValues, type UiStatus } from "./logic";
import type { Context, Issue, IssueDetail, IssueStatus, Priority } from "./types";

export interface Saved { id: string; patch: Partial<Issue>; from: IssueStatus; to: IssueStatus }
interface Props { issue: Issue | null; ctx: Context; onClose: () => void; onSaved: (s: Saved) => void }

/** "Edit Issue": the apartment, unit and tenant are fixed; the rest can change while the landlord has not started work. */
export function EditRequestModal({ issue, ctx, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!issue} onClose={onClose} labelledBy="er-title" busy={busy} maxWidth="max-w-[580px]">
      {issue && <Loader issue={issue} ctx={ctx} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

/** The list only has the cover photo, so the full request (every photo) is fetched when the window opens. */
function Loader(p: { issue: Issue; ctx: Context; onClose: () => void; onSaved: (s: Saved) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.maintenance.edit");
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    authApi<IssueDetail>(`/maintenance/${p.issue.id}`).then((d) => { if (live) setDetail(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [p.issue.id, tick]);

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center text-red-700">
        <AlertTriangle className="size-9" aria-hidden /><h2 id="er-title" className="font-semibold">{t("loadError")}</h2>
        <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm">{t("retry")}</button>
      </div>
    );
  }
  if (!detail) return <div aria-busy="true" className="space-y-3 py-2"><h2 id="er-title" className="sr-only">{t("title")}</h2><div className="skeleton h-7 w-48 rounded" /><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-28 rounded-lg" /></div>;
  return <Form detail={detail} {...p} />;
}

function Form({ detail, issue, ctx, onClose, onSaved, setBusy }: { detail: IssueDetail; issue: Issue; ctx: Context; onClose: () => void; onSaved: (s: Saved) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.maintenance.edit");
  const s = useTranslations("owner.maintenance.status");
  const toast = useToast();
  const original = detail.status;
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema), mode: "onTouched",
    defaultValues: { category: detail.category, priority: detail.priority, title: detail.title, description: detail.description, preferred: toLocalInput(detail.preferredAt), status: uiStatus(original) },
  });
  const [kept, setKept] = useState(detail.images);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const chosen = watch("status") as UiStatus;
  const locked = contentLocked(original, chosen);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null);
    if (kept.length + files.length > MAX_PHOTOS) { setBanner(t("errors.photo.many")); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (f.status !== uiStatus(original) && f.status !== "IN_PROGRESS") body.status = f.status;
      let cover: string | null | undefined;
      if (!locked) {
        Object.assign(body, { category: f.category, priority: f.priority, title: f.title, description: f.description, preferredAt: preferredIso(f.preferred) ?? null });
        const changed = files.length > 0 || kept.length !== detail.images.length;
        if (changed) {
          const fresh = await Promise.all(files.map((file) => uploadPrivate("MAINTENANCE_IMAGE", file, file.type)));
          body.images = [...kept.map((k) => k.storageKey), ...fresh];
          cover = kept[0]?.url ?? (files[0] ? URL.createObjectURL(files[0]) : null);
        }
      }
      const r = await authApi<{ status: IssueStatus }>(`/maintenance/${issue.id}`, { method: "PATCH", body });
      toast("success", t("done"));
      onSaved({
        id: issue.id, from: original, to: r.status,
        patch: { status: r.status, ...(locked ? {} : { category: f.category, priority: f.priority as Priority, title: f.title.trim(), description: f.description.trim(), preferredAt: preferredIso(f.preferred) ?? null }), ...(cover !== undefined ? { coverUrl: cover } : {}) },
      });
      onClose();
    } catch (e) {
      setSaving(false);
      setBanner(t(e instanceof ApiError && e.code === "INVALID_STATE" ? "errors.locked" : e instanceof ApiError && e.code === "NETWORK" ? "errors.network" : "errors.generic"));
    }
  });

  return (
    <>
      <header className="pr-10">
        <h2 id="er-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-4" aria-busy={saving || undefined}>
        <ContextTags ctx={ctx} />
        <RequestFields idp="er" register={register} errors={errors} priority={watch("priority") as Priority} onPriority={(p) => setValue("priority", p, { shouldDirty: true })} disabled={saving || locked} minLocal="" />
        <GlassField label={t("condition")} htmlFor="er-status" hint={original === "IN_PROGRESS" ? t("conditionInProgress") : t("conditionHint")}>
          <GlassSelect id="er-status" icon={ListChecks} disabled={saving} {...register("status")}>
            <option value="PENDING">{s("PENDING")}</option>
            <option value="IN_PROGRESS" disabled={original !== "IN_PROGRESS"}>{s("IN_PROGRESS")}</option>
            <option value="COMPLETED">{s("COMPLETED")}</option>
          </GlassSelect>
        </GlassField>
        {locked && <p role="note" className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs font-medium text-sky-800"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("locked")}</p>}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("evidence")}</p>
          {kept.length === 0 && files.length === 0 && <p className="mb-2 text-xs text-label">{t("noPhoto")}</p>}
          {kept.length > 0 && (
            <ul className="mb-2.5 flex flex-wrap gap-2.5">
              {kept.map((k) => (
                <li key={k.id} className="relative size-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {k.url
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    ? <img src={k.url} alt={t("photoAlt")} className="size-full object-cover" />
                    : <span className="grid size-full place-items-center text-[0.65rem] text-label">{t("noPreview")}</span>}
                  {!locked && <button type="button" onClick={() => setKept((c) => c.filter((x) => x.id !== k.id))} disabled={saving} aria-label={t("removePhoto")} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-slate-900/70 text-white"><X className="size-3" aria-hidden /></button>}
                </li>
              ))}
            </ul>
          )}
          {!locked && <PhotoPicker files={files} onChange={setFiles} disabled={saving} label={t("replace")} onProblem={(k) => setBanner(t(`errors.photo.${k}`))} />}
        </div>

        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-52">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{saving ? t("saving") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
