"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { BoostDetails } from "./BoostDetails";
import type { BoostRow } from "./types";

export type EditState = "ACTIVE" | "EXPIRED" | "FAILED";
export interface EditInput { state?: EditState; durationDays?: number; reason?: string }

interface Props { row: BoostRow | null; busy: boolean; onClose: () => void; onSave: (r: BoostRow, input: EditInput) => void; onDelete: (r: BoostRow) => void }

/** Full details on top, then the things the Super Admin can change: Active / Expired / Payment failed, the days, and Delete. */
export function BoostEditModal({ row, busy, onClose, onSave, onDelete }: Props) {
  const t = useTranslations("admin.paidBoost");
  const [state, setState] = useState<EditState | null>(null);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<"days" | "reason" | null>(null);

  useEffect(() => {
    if (!row) return;
    setState(row.state === "ACTIVE" ? "ACTIVE" : row.state === "EXPIRED" ? "EXPIRED" : row.state === "PENDING" ? null : "FAILED");
    setDays(String(row.durationDays)); setReason(row.rejectionReason ?? ""); setError(null);
  }, [row]);

  // A boost that was paid cannot become "payment failed"; one that never started cannot become "expired".
  const paid = row?.state === "ACTIVE" || row?.state === "EXPIRED";
  const started = paid;
  const options: { id: EditState; tone: string; off: boolean }[] = [
    { id: "ACTIVE", tone: "border-emerald-300 bg-emerald-50 text-emerald-700", off: false },
    { id: "EXPIRED", tone: "border-slate-300 bg-slate-100 text-slate-700", off: !started },
    { id: "FAILED", tone: "border-red-300 bg-red-50 text-red-700", off: paid },
  ];

  function save() {
    if (!row) return;
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 90) { setError("days"); return; }
    if (state === "FAILED" && reason.trim().length < 3) { setError("reason"); return; }
    onSave(row, { ...(state ? { state } : {}), ...(n !== row.durationDays ? { durationDays: n } : {}), ...(state === "FAILED" ? { reason: reason.trim() } : {}) });
  }
  const changed = !!row && (state !== (row.state === "ACTIVE" ? "ACTIVE" : row.state === "EXPIRED" ? "EXPIRED" : row.state === "PENDING" ? null : "FAILED") || Number(days) !== row.durationDays || (state === "FAILED" && reason.trim() !== (row.rejectionReason ?? "")));

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy="pb-edit" busy={busy} maxWidth="max-w-[680px]">
      {row && (
        <div>
          <h2 id="pb-edit" className="pr-10 text-xl font-bold text-navy">{t("editModal.title")}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">{t("editModal.subtitle")}</p>
          <BoostDetails r={row} />

          <fieldset className="mt-5 border-t border-slate-200/70 pt-4" disabled={busy}>
            <legend className="text-xs font-bold uppercase tracking-wider text-label">{t("editModal.statusTitle")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("editModal.statusTitle")}>
              {options.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={state === o.id} disabled={o.off} onClick={() => { setState(o.id); setError(null); }}
                  className={clsx("h-11 rounded-xl border-2 px-3 text-sm font-bold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40", state === o.id ? o.tone + " shadow-md" : "border-slate-200 bg-white/80 text-slate-600 hover:border-[#48BDFA]")}>
                  {state === o.id && <Check className="mr-1 inline size-4" aria-hidden />}{t(`editModal.option.${o.id}`)}
                </button>
              ))}
            </div>
            {paid && <p className="mt-2 text-xs text-slate-500">{t("editModal.paidNote")}</p>}

            <label htmlFor="pb-days" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{t("editModal.days")}</label>
            <input id="pb-days" type="number" inputMode="numeric" min={1} max={90} value={days} onChange={(e) => { setDays(e.target.value); setError(null); }} className="glass-input mt-2 h-11 w-full rounded-lg px-3 text-sm text-navy outline-none sm:w-40" data-invalid={error === "days" || undefined} aria-invalid={error === "days" || undefined} />
            {error === "days" && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("editModal.daysError")}</p>}

            {state === "FAILED" && (
              <>
                <label htmlFor="pb-fail-reason" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{t("rejectModal.reason")}</label>
                <textarea id="pb-fail-reason" rows={2} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder={t("rejectModal.placeholder")} className="glass-input mt-2 w-full resize-none rounded-lg p-3 text-sm text-navy outline-none" data-invalid={error === "reason" || undefined} aria-invalid={error === "reason" || undefined} />
                {error === "reason" && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("rejectModal.required")}</p>}
              </>
            )}
          </fieldset>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => onDelete(row)} disabled={busy} className="btn btn-danger h-12 sm:min-w-36"><Trash2 className="size-4" aria-hidden />{t("delete")}</button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
              <button type="button" onClick={save} disabled={busy || !changed} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-40">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("working") : t("editModal.save")}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
