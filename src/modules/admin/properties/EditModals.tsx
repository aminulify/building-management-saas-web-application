"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import type { PropertyRow } from "./types";
import { PropertyBody } from "./ViewModal";

export type Choice = "ACTIVE" | "PENDING" | "DELETE";
const CHOICES: Choice[] = ["ACTIVE", "PENDING", "DELETE"];
const DOT: Record<Choice, string> = { ACTIVE: "text-emerald-600", PENDING: "text-amber-500", DELETE: "text-red-600" };

interface EditProps { row: PropertyRow | null; open: boolean; choice: Choice; onChoice: (c: Choice) => void; onSave: () => void; onClose: () => void }

/**
 * "Edit Property": all the details of "View Details" on top, the status choices at the bottom (Active, Default Pending, Delete).
 * Saving does not apply anything yet: the confirmation window comes next.
 */
export function EditModal({ row, open, choice, onChoice, onSave, onClose }: EditProps) {
  const t = useTranslations("admin.properties.editModal");
  const unchanged = !!row && choice !== "DELETE" && choice === row.state;
  return (
    <Modal open={open && !!row} onClose={onClose} labelledBy="pe-title" maxWidth="max-w-[800px]">
      {row && (
        <PropertyBody
          row={row} headingId="pe-title" heading={t("title")}
          footer={(
            <div className="mt-6 border-t border-slate-200/80 pt-5">
              <fieldset>
                <legend className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-label"><Pencil className="size-3.5" aria-hidden />{t("legend")}</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CHOICES.map((c) => (
                    <label key={c} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0", choice === c ? (c === "DELETE" ? "border-red-400 bg-red-50/80" : "border-[#0A84F0] bg-sky-50/80") : "border-slate-200 bg-white/70")}>
                      <input type="radio" name="pe-status" value={c} checked={choice === c} onChange={() => onChoice(c)} className="mt-1 size-4 accent-[#0A84F0]" />
                      <span className="min-w-0"><span className={clsx("flex items-center gap-1.5 font-semibold", c === "DELETE" ? "text-red-700" : "text-navy")}><span aria-hidden className={clsx("text-lg leading-none", DOT[c])}>●</span>{t(`choices.${c}`)}</span><span className="mt-0.5 block text-xs text-slate-500">{t(`hints.${c}`)}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={onClose} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
                <button type="button" onClick={unchanged ? onClose : onSave} className="btn btn-primary h-12 sm:min-w-40"><Check className="size-4" aria-hidden />{t("save")}</button>
              </div>
            </div>
          )}
        />
      )}
    </Modal>
  );
}

interface ConfirmProps { row: PropertyRow | null; open: boolean; choice: Choice; onConfirm: () => Promise<void>; onBack: () => void }

/** "Are you sure?": the change is applied only after Yes. */
export function ConfirmModal({ row, open, choice, onConfirm, onBack }: ConfirmProps) {
  const t = useTranslations("admin.properties.confirm");
  const [busy, setBusy] = useState(false);
  const del = choice === "DELETE";
  async function yes() { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }
  return (
    <Modal open={open && !!row} onClose={onBack} labelledBy="pc-title" busy={busy} maxWidth="max-w-[440px]">
      {row && (
        <div className="text-center">
          <span aria-hidden className={clsx("mx-auto grid size-14 place-items-center rounded-full border-2", del ? "border-red-300 bg-red-100 text-red-600" : "border-amber-300 bg-amber-100 text-amber-600")}>{del ? <Trash2 className="size-6" /> : <AlertTriangle className="size-6" />}</span>
          <h2 id="pc-title" className="mt-3 text-2xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{del ? t(row.occupiedUnits > 0 ? "deleteWithTenants" : "deleteText", { name: row.name, count: row.occupiedUnits }) : t("changeText", { name: row.name, status: t(`status.${choice}`) })}</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <button type="button" data-autofocus onClick={onBack} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("no")}</button>
            <button type="button" onClick={() => void yes()} disabled={busy} aria-busy={busy || undefined} className={clsx("btn h-12 sm:min-w-40", del ? "btn-danger" : "btn-primary")}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : del ? <Trash2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("working") : t("yes")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
