"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { DocReview } from "../tenants/DocReview";
import { OwnerFrame } from "./OwnerFrame";
import type { DocKind } from "../tenants/types";
import type { AccountState, OwnerDetails, OwnerRow } from "./types";

const OPTIONS: { id: AccountState; tone: string }[] = [
  { id: "ACTIVE", tone: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { id: "WARNING", tone: "border-amber-300 bg-amber-50 text-amber-700" },
  { id: "SUSPENDED", tone: "border-red-300 bg-red-50 text-red-700" },
];
export interface StatusInput { status: AccountState; comment?: string }

interface Props { row: OwnerRow | null; busy: boolean; onClose: () => void; onSave: (r: OwnerRow, input: StatusInput) => void; onMessage: (d: OwnerDetails) => void; onChanged: () => void }
type Section = "status" | DocKind;
const SECTIONS: Section[] = ["status", "NID_FRONT", "NID_BACK", "AGREEMENT"];

/** Edit Status & Comment Log: full profile on top; Active / Warning / Suspended at the bottom. Warning and Suspended need a written reason. */
export function StatusModal({ row, busy, onClose, onSave, onMessage, onChanged }: Props) {
  const t = useTranslations("admin.owners.edit");
  const td = useTranslations("admin.tenants.docs");
  const [section, setSection] = useState<Section>("status");
  useEffect(() => { if (row) setSection("status"); }, [row]);
  const [status, setStatus] = useState<AccountState>("ACTIVE");
  const [comment, setComment] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => { if (row) { setStatus(row.state); setComment(""); setError(false); } }, [row]);
  const needs = status !== "ACTIVE";
  const changed = !!row && (status !== row.state || comment.trim().length > 0);

  function save() {
    if (!row) return;
    const text = comment.trim();
    if (needs && text.length < 3) { setError(true); return; }
    onSave(row, { status, ...(text ? { comment: text } : {}) });
  }

  return (
    <OwnerFrame row={row} busy={busy} onClose={onClose} labelledBy="ow-edit" title={t("title")} onMessage={onMessage}>
      {(d, reload) => row && (
        <div>
          <div role="tablist" aria-label={t("sectionTitle")} className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/70 bg-white/60 p-1">
            {SECTIONS.map((x) => {
              const doc = x === "status" || !d ? null : d.documents[x === "NID_FRONT" ? "nidFront" : x === "NID_BACK" ? "nidBack" : "agreement"];
              return (
                <button key={x} type="button" role="tab" aria-selected={section === x} onClick={() => setSection(x)} className={clsx("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-300", section === x ? "bg-[#0A84F0] text-white shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" : "text-slate-600 hover:text-[#0A84F0]")}>
                  {x === "status" ? t("statusTab") : td(`kind.${x}`)}
                  {doc && doc.status === "PENDING" && <i aria-hidden className="ml-1.5 inline-block size-2 rounded-full bg-amber-400" />}
                </button>
              );
            })}
          </div>
          {section !== "status" ? (d ? <DocReview endpoint={`/admin/active-owners/${row.id}/documents`} kind={section} doc={d.documents[section === "NID_FRONT" ? "nidFront" : section === "NID_BACK" ? "nidBack" : "agreement"]} onChanged={() => { reload(); onChanged(); }} /> : null) : <>
          <h3 className="text-sm font-bold text-navy">{t("sectionTitle")}</h3>
          <p className="text-xs text-slate-500">{t("subtitle")}</p>
          <fieldset disabled={busy} className="mt-3">
            <legend className="sr-only">{t("statusLabel")}</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("statusLabel")}>
              {OPTIONS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={status === o.id} onClick={() => { setStatus(o.id); setError(false); }}
                  className={clsx("flex h-11 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-all duration-300", status === o.id ? o.tone + " shadow-md" : "border-slate-200 bg-white/80 text-slate-600 hover:border-[#48BDFA]")}>
                  <i aria-hidden className={clsx("size-3 rounded-full border-2", status === o.id ? "border-current bg-current" : "border-slate-300")} />{t(`option.${o.id}`)}
                </button>
              ))}
            </div>
            <label htmlFor="ow-comment" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{needs ? t("reason") : t("noteOptional")}</label>
            <textarea id="ow-comment" rows={3} maxLength={500} value={comment} onChange={(e) => { setComment(e.target.value); setError(false); }} placeholder={needs ? t("reasonPlaceholder") : t("notePlaceholder")} className="glass-input mt-2 w-full resize-none rounded-lg p-3 text-sm text-navy outline-none" data-invalid={error || undefined} aria-invalid={error || undefined} aria-required={needs} />
            {error && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("required")}</p>}
          </fieldset>
          <p className="mt-3 text-xs text-slate-500">{t("notify")}</p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
            <button type="button" onClick={save} disabled={busy || !changed} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-40">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button>
          </div>
          </>}
        </div>
      )}
    </OwnerFrame>
  );
}
