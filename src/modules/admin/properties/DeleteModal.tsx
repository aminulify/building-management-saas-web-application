"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import type { PropertyRow } from "./types";
import { PropertyBody } from "./ViewModal";

/** Same codes as the server (modules/properties/archive-reasons.ts). */
const REASONS = ["OWNER_REQUEST", "POLICY_VIOLATION", "NON_PAYMENT", "BUILDING_DEMOLISHED", "SOLD_PROPERTY", "RENOVATION", "NOT_INTERESTED", "DUPLICATE_ENTRY", "MOVED_PLATFORM", "OTHER"] as const;
type Code = (typeof REASONS)[number];

interface Props { row: PropertyRow | null; busy: boolean; onClose: () => void; onConfirm: (r: PropertyRow, input: { reasonCode: Code; note?: string }) => void }

/** Delete from the Properties table: the full details on top, then the reason (dropdown) and a note, then Yes / Cancel. */
export function DeleteModal({ row, busy, onClose, onConfirm }: Props) {
  const t = useTranslations("admin.properties.deleteModal");
  const tr = useTranslations("admin.previousProperties.reason");
  const [code, setCode] = useState<Code | "">("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (row) { setCode(""); setNote(""); setProblem(null); } }, [row]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    if (!code) { setProblem(t("pick")); return; }
    if (code === "OTHER" && note.trim().length < 3) { setProblem(t("needNote")); return; }
    onConfirm(row, { reasonCode: code, ...(note.trim().length >= 3 ? { note: note.trim() } : {}) });
  }

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy="pd-title" busy={busy} maxWidth="max-w-[800px]">
      {row && (
        <PropertyBody
          row={row} headingId="pd-title" heading={t("title")}
          footer={(
            <form onSubmit={submit} className="mt-6 space-y-4 border-t border-slate-200/80 pt-5">
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><Trash2 className="size-5" /></span>
                <div><p className="font-bold text-red-700">{t("text", { name: row.name })}</p><p className="mt-0.5 text-xs text-red-700/80">{row.occupiedUnits > 0 ? t("withTenants", { count: row.occupiedUnits }) : t("note")}</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[18rem_1fr]">
                <div>
                  <label htmlFor="pd-reason" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("reason")}</label>
                  <select id="pd-reason" value={code} onChange={(e) => { setCode(e.target.value as Code | ""); setProblem(null); }} disabled={busy} className="glass-input h-12 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none">
                    <option value="">{t("choose")}</option>
                    {REASONS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pd-note" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{code === "OTHER" ? t("noteRequired") : t("noteOptional")}</label>
                  <textarea id="pd-note" value={note} onChange={(e) => { setNote(e.target.value); setProblem(null); }} maxLength={300} rows={2} disabled={busy} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
                </div>
              </div>
              {problem && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><AlertTriangle className="size-4 shrink-0" aria-hidden />{problem}</p>}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
                <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("working") : t("yes")}</button>
              </div>
            </form>
          )}
        />
      )}
    </Modal>
  );
}
