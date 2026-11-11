"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { uploadPrivate } from "../../owner/profile/upload";
import { PhotoPicker } from "../dashboard/PhotoPicker";
import { ContextTags } from "./ContextTags";
import { RequestFields } from "./RequestFields";
import { issueFrom, preferredIso, requestSchema, toLocalInput, type RequestValues } from "./logic";
import type { Context, Issue, IssueStatus, Priority } from "./types";

interface Props { open: boolean; ctx: Context; onClose: () => void; onCreated: (issue: Issue) => void }
interface Created { id: string; category: string; title: string; description: string; priority: Priority; status: IssueStatus; createdAt: string; preferredAt: string | null }

/** "+ New Request": apartment, unit and tenant are filled in; the request starts as Pending and the landlord is told at once. */
export function NewRequestModal({ open, ctx, onClose, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="nr-title" busy={busy} maxWidth="max-w-[580px]">
      {open && <Body ctx={ctx} onClose={onClose} onCreated={onCreated} setBusy={setBusy} />}
    </Modal>
  );
}

function Body({ ctx, onClose, onCreated, setBusy }: { ctx: Context; onClose: () => void; onCreated: (i: Issue) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("tenant.maintenance.new");
  const toast = useToast();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema), mode: "onTouched",
    defaultValues: { category: "PLUMBING", priority: "MEDIUM", title: "", description: "", preferred: "", status: "PENDING" },
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);

  const onSubmit = handleSubmit(async (f) => {
    setBanner(null); setSaving(true);
    try {
      const images = await Promise.all(files.map((file) => uploadPrivate("MAINTENANCE_IMAGE", file, file.type)));
      const r = await authApi<Created>("/maintenance", { method: "POST", body: { category: f.category, priority: f.priority, title: f.title, description: f.description, preferredAt: preferredIso(f.preferred), images } });
      toast("success", t("done"));
      onCreated(issueFrom(r, ctx, files[0] ? URL.createObjectURL(files[0]) : null));
      onClose();
    } catch (e) {
      setSaving(false);
      setBanner(t(e instanceof ApiError && e.code === "INVALID_STATE" ? "errors.noLease" : e instanceof ApiError && e.code === "NETWORK" ? "errors.network" : "errors.generic"));
    }
  });

  return (
    <>
      <header className="pr-10">
        <h2 id="nr-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </header>
      <form noValidate method="post" onSubmit={onSubmit} className="mt-4 space-y-4" aria-busy={saving || undefined}>
        <ContextTags ctx={ctx} />
        <RequestFields idp="nr" register={register} errors={errors} priority={watch("priority") as Priority} onPriority={(p) => setValue("priority", p, { shouldDirty: true })} disabled={saving} minLocal={toLocalInput(new Date().toISOString())} />
        <PhotoPicker files={files} onChange={setFiles} disabled={saving} label={t("photos")} onProblem={(k) => setBanner(t(`errors.photo.${k}`))} />
        {banner && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}</div>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
          <button type="submit" disabled={saving} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-52">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}{saving ? t("sending") : t("submit")}</button>
        </div>
      </form>
    </>
  );
}
