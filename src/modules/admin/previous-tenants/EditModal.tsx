"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { TenantFrame, type Person } from "./TenantFrame";
import { REASONS, RENT_STATES, type ArchiveRow, type Reason, type RentState } from "./types";

export interface RecordInput { rentStatus: RentState; reason: Reason; note?: string }
interface Props { row: ArchiveRow | null; busy: boolean; onClose: () => void; onSave: (r: ArchiveRow, i: RecordInput) => void; onMessage: (p: Person) => void }

/** Edit Rent Status & Reason: the clearance ruling (Cleared, 1 / 2 / 3+ months due) and why the tenant left, with an optional note. */
export function EditModal({ row, busy, onClose, onSave, onMessage }: Props) {
  const t = useTranslations("admin.previousTenants.edit");
  const trs = useTranslations("admin.previousTenants.rent");
  const tr = useTranslations("admin.previousTenants.reason");
  const [rent, setRent] = useState<RentState>("CLEARED");
  const [reason, setReason] = useState<Reason>("OTHER");
  const [note, setNote] = useState("");
  useEffect(() => { if (row) { setRent(row.rentStatus); setReason(row.reasonCode); setNote(row.note ?? ""); } }, [row]);
  const field = "glass-input h-12 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none";

  return (
    <TenantFrame row={row} busy={busy} onClose={onClose} labelledBy="pt-edit" title={t("title")} onMessage={onMessage}>
      {() => row && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(row, { rentStatus: rent, reason, note: note.trim() }); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pt-new-rent" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("rent")}</label>
              <select id="pt-new-rent" value={rent} onChange={(e) => setRent(e.target.value as RentState)} className={field}>
                {RENT_STATES.map((s) => <option key={s} value={s}>{trs(s)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pt-new-reason" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("reason")}</label>
              <select id="pt-new-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)} className={field}>
                {REASONS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pt-note" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("note")}</label>
            <textarea id="pt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
          </div>
          <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-800"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("hint")}</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button>
          </div>
        </form>
      )}
    </TenantFrame>
  );
}
