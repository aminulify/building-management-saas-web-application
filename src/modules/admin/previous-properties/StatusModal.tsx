"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { PropertyFrame } from "./PropertyFrame";
import { REASONS, STATUSES, type ArchiveDetails, type ArchiveRow, type NewStatus, type Reason } from "./types";

export interface StatusInput { status: NewStatus; reason?: Reason; note?: string }
interface Props { row: ArchiveRow | null; busy: boolean; onClose: () => void; onSave: (r: ArchiveRow, i: StatusInput) => void; onMessage: (o: ArchiveDetails["owner"]) => void }

/** Edit Status & Reactivate: pick Active (Reactivate), Archived, Suspended, Inactive or Deleted, with the reason. Active puts it back in the live lists. */
export function StatusModal({ row, busy, onClose, onSave, onMessage }: Props) {
  const t = useTranslations("admin.previousProperties.edit");
  const ts = useTranslations("admin.previousProperties.status");
  const tr = useTranslations("admin.previousProperties.reason");
  const [status, setStatus] = useState<NewStatus>("ACTIVE");
  const [reason, setReason] = useState<Reason>("OTHER");
  const [note, setNote] = useState("");
  useEffect(() => { if (row) { setStatus(row.status); setReason(row.reasonCode); setNote(""); } }, [row]);
  const field = "glass-input h-12 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <PropertyFrame row={row} busy={busy} onClose={onClose} labelledBy="pp-edit" title={t("title")} onMessage={onMessage}>
      {(d) => row && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(row, status === "ACTIVE" ? { status } : { status, reason, ...(note.trim() ? { note: note.trim() } : {}) }); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pp-new-status" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("status")}</label>
              <select id="pp-new-status" value={status} onChange={(e) => setStatus(e.target.value as NewStatus)} className={field}>
                <option value="ACTIVE">{t("reactivate")}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pp-new-reason" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("reason")}</label>
              <select id="pp-new-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)} disabled={status === "ACTIVE"} className={`${field} disabled:opacity-50`}>
                {REASONS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
              </select>
            </div>
          </div>
          {status !== "ACTIVE" && (
            <div>
              <label htmlFor="pp-note" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("note")}</label>
              <textarea id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
            </div>
          )}
          <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-800"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t(`hint.${status}`)}</p>
          {status === "ACTIVE" && d && !d.owner.ready && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{t("ownerNotReady")}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button type="submit" disabled={busy || (status === "ACTIVE" && !!d && !d.owner.ready)} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-44">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : status === "ACTIVE" ? <RotateCcw className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? t("saving") : status === "ACTIVE" ? t("reactivateNow") : t("save")}
            </button>
          </div>
        </form>
      )}
    </PropertyFrame>
  );
}
