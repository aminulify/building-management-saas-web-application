"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, FileText, ImageOff, Loader2, Lock, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { day } from "../manage-home/format";
import { VERIFY_STYLE } from "./TenantsTable";
import type { DocKind, DocView } from "./types";

interface Props { /** e.g. /admin/active-owners/:id/documents */ endpoint: string; kind: DocKind; doc: DocView | null; onChanged: () => void }

/** One document at a time: the picture, its state, and Verify / Reject. A verified document is locked for the tenant; every decision notifies the tenant. */
export function DocReview({ endpoint, kind, doc, onChanged }: Props) {
  const t = useTranslations("admin.tenants.docs");
  const locale = useLocale();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"VERIFIED" | "REJECTED" | null>(null);
  useEffect(() => { setRejecting(false); setNote(""); setError(false); }, [kind, doc?.id, doc?.status]);

  async function decide(decision: "VERIFIED" | "REJECTED") {
    if (decision === "REJECTED" && note.trim().length < 3) { setError(true); return; }
    setBusy(decision);
    try {
      await authApi(`${endpoint}/${kind}`, { method: "PATCH", body: { decision, ...(decision === "REJECTED" ? { note: note.trim() } : {}) } });
      toast("success", t(decision === "VERIFIED" ? "toast.verified" : "toast.rejected", { doc: t(`kind.${kind}`) }));
      onChanged();
    } catch (e) { toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed")); } finally { setBusy(null); }
  }

  const name = t(`kind.${kind}`);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">{name}</h3>
        {doc && <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[doc.status])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${doc.status}`)}</span>}
      </div>

      {!doc ? (
        <div className="mt-3 grid h-32 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-400"><span><ImageOff className="mx-auto size-6" aria-hidden /><span className="mt-1 block text-sm">{t("notUploaded", { doc: name })}</span></span></div>
      ) : (
        <div className="mt-3 space-y-3">
          {doc.url && !doc.isPdf ? <a href={doc.url} target="_blank" rel="noreferrer" aria-label={t("open", { doc: name })}><img src={doc.url} alt={name} className="max-h-72 w-full rounded-xl border border-white bg-white object-contain shadow-sm" /></a> : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3">
              <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-sky-100 text-[#0A84F0]"><FileText className="size-5" /></span>
              <span className="min-w-0 flex-1 text-sm text-slate-600">{doc.url ? t("pdf") : t("noPreview")}</span>
              {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" className="btn btn-white h-10 px-4 text-sm"><ExternalLink className="size-4" aria-hidden />{t("openShort")}</a>}
            </div>
          )}
          <p className="text-xs text-slate-500">{doc.source === "LANDLORD" ? t("landlordCopy", { date: day(locale, doc.uploadedAt) }) : t("uploaded", { date: day(locale, doc.uploadedAt) })}</p>
          {doc.notes && doc.status === "REJECTED" && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><b>{t("rejectedReason")}</b> {doc.notes}</p>}

          {!doc.reviewable ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{t("viewOnly")}</p> : (
            <>
              {doc.locked && <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("locked")}</p>}
              {rejecting && (
                <div>
                  <label htmlFor="doc-note" className="block text-xs font-bold uppercase tracking-wider text-label">{t("reasonLabel")}</label>
                  <textarea id="doc-note" rows={2} maxLength={300} value={note} onChange={(e) => { setNote(e.target.value); setError(false); }} placeholder={t("reasonPlaceholder")} className="glass-input mt-2 w-full resize-none rounded-lg p-3 text-sm text-navy outline-none" data-invalid={error || undefined} aria-invalid={error || undefined} />
                  {error && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("reasonRequired")}</p>}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {rejecting ? (
                  <>
                    <button type="button" onClick={() => { setRejecting(false); setError(false); }} disabled={!!busy} className="btn btn-white h-11 px-4 text-sm">{t("cancel")}</button>
                    <button type="button" onClick={() => void decide("REJECTED")} disabled={!!busy} aria-busy={busy === "REJECTED" || undefined} className="btn btn-danger h-11 px-4 text-sm">{busy === "REJECTED" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}{t("confirmReject")}</button>
                  </>
                ) : (
                  <>
                    {doc.status !== "REJECTED" && <button type="button" onClick={() => setRejecting(true)} disabled={!!busy} className="btn btn-danger h-11 px-4 text-sm"><X className="size-4" aria-hidden />{t("reject")}</button>}
                    {doc.status !== "VERIFIED" && <button type="button" onClick={() => void decide("VERIFIED")} disabled={!!busy || !doc.url} aria-busy={busy === "VERIFIED" || undefined} className="btn btn-primary h-11 px-4 text-sm">{busy === "VERIFIED" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{t("verify")}</button>}
                  </>
                )}
              </div>
              <p className="text-[0.7rem] text-slate-500">{t("notifyNote")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
