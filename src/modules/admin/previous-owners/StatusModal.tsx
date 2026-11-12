"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { OwnerFrame } from "./OwnerFrame";
import { REASONS, STATES, type ArchiveDetails, type ArchiveRow, type NewState, type Reason } from "./types";

export interface StateInput { status: NewState; reason?: Reason; note?: string }
interface Props { row: ArchiveRow | null; busy: boolean; onClose: () => void; onSave: (r: ArchiveRow, i: StateInput) => void; onMessage: (d: ArchiveDetails) => void }

/** Edit Status & Reactivate Owner: Active (Unban & Reactivate), Archived, Banned, Inactive or Deleted, with the reason. Active brings the owner back to Active Property Owners. */
export function StatusModal({ row, busy, onClose, onSave, onMessage }: Props) {
  const t = useTranslations("admin.previousOwners.edit");
  const ts = useTranslations("admin.previousOwners.status");
  const tr = useTranslations("admin.previousOwners.reason");
  const [status, setStatus] = useState<NewState>("ACTIVE");
  const [reason, setReason] = useState<Reason>("OTHER");
  const [note, setNote] = useState("");
  useEffect(() => { if (row) { setStatus(row.state); setReason(row.reasonCode); setNote(""); } }, [row]);
  const field = "glass-input h-12 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <OwnerFrame row={row} busy={busy} onClose={onClose} labelledBy="po-edit" title={t("title")} onMessage={onMessage}>
      {() => row && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(row, status === "ACTIVE" ? { status } : { status, reason, ...(note.trim() ? { note: note.trim() } : {}) }); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="po-new-status" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("status")}</label>
              <select id="po-new-status" value={status} onChange={(e) => setStatus(e.target.value as NewState)} className={field}>
                <option value="ACTIVE">{t("reactivate")}</option>
                {STATES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-new-reason" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("reason")}</label>
              <select id="po-new-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)} disabled={status === "ACTIVE"} className={`${field} disabled:opacity-50`}>
                {REASONS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
              </select>
            </div>
          </div>
          {status !== "ACTIVE" && (
            <div>
              <label htmlFor="po-note" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("note")}</label>
              <textarea id="po-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
            </div>
          )}
          <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-800"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t(`hint.${status}`)}</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-48">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : status === "ACTIVE" ? <RotateCcw className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? t("saving") : status === "ACTIVE" ? t("reactivateNow") : t("save")}
            </button>
          </div>
        </form>
      )}
    </OwnerFrame>
  );
}
