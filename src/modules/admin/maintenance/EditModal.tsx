"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { RequestFrame } from "./RequestFrame";
import type { ReqPriority, ReqRow, ReqStatus } from "./types";

export interface EditInput { priority?: ReqPriority; status?: ReqStatus; technicianName?: string | null }
const PRIORITIES: ReqPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SETTABLE: ReqStatus[] = ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"];

interface Props { row: ReqRow | null; busy: boolean; onClose: () => void; onSave: (r: ReqRow, input: EditInput) => void }

/** Edit Request: priority, status and the technician. Only what changed is sent. */
export function EditModal({ row, busy, onClose, onSave }: Props) {
  const t = useTranslations("admin.maintenance.edit");
  const tt = useTranslations("admin.maintenance.table");
  const [priority, setPriority] = useState<ReqPriority>("MEDIUM");
  const [status, setStatus] = useState<ReqStatus>("PENDING");
  const [tech, setTech] = useState("");
  const [techOriginal, setTechOriginal] = useState("");
  const [techError, setTechError] = useState(false);

  useEffect(() => {
    if (!row) return;
    setPriority(row.priority); setStatus(row.status); setTechError(false);
    setTech(row.technicianName ?? ""); setTechOriginal(row.technicianName ?? "");
  }, [row]);

  const statuses = row && !SETTABLE.includes(row.status) ? [row.status, ...SETTABLE] : SETTABLE;
  const changed = !!row && (priority !== row.priority || status !== row.status || tech.trim() !== techOriginal);

  function save() {
    if (!row) return;
    const name = tech.trim();
    if (name && name.length < 2) { setTechError(true); return; }
    onSave(row, {
      ...(priority !== row.priority ? { priority } : {}),
      ...(status !== row.status ? { status } : {}),
      ...(name !== techOriginal ? { technicianName: name || null } : {}),
    });
  }

  const sel = "glass-input mt-2 h-11 w-full rounded-lg px-3 text-sm font-semibold text-navy outline-none";

  return (
    <RequestFrame row={row} busy={busy} onClose={onClose} labelledBy="mr-edit" title={t("title")}>
      {() => row && (
        <div>
          <h3 className="text-sm font-bold text-navy">{t("sectionTitle")}</h3>
          <p className="text-xs text-slate-500">{t("subtitle")}</p>
          <fieldset className="mt-3 grid gap-4 sm:grid-cols-3" disabled={busy}>
            <div>
              <label htmlFor="mr-priority" className="block text-xs font-bold uppercase tracking-wider text-label">{t("priority")}</label>
              <select id="mr-priority" value={priority} onChange={(e) => setPriority(e.target.value as ReqPriority)} className={sel}>{PRIORITIES.map((p) => <option key={p} value={p}>{tt(`priority.${p}`)}</option>)}</select>
            </div>
            <div>
              <label htmlFor="mr-status" className="block text-xs font-bold uppercase tracking-wider text-label">{t("status")}</label>
              <select id="mr-status" value={status} onChange={(e) => setStatus(e.target.value as ReqStatus)} className={sel}>{statuses.map((s) => <option key={s} value={s} disabled={!SETTABLE.includes(s)}>{tt(`status.${s}`)}</option>)}</select>
            </div>
            <div>
              <label htmlFor="mr-tech" className="block text-xs font-bold uppercase tracking-wider text-label">{t("technician")}</label>
              <input id="mr-tech" value={tech} maxLength={80} onChange={(e) => { setTech(e.target.value); setTechError(false); }} placeholder={t("technicianPlaceholder")} className={sel + " font-medium"} data-invalid={techError || undefined} aria-invalid={techError || undefined} />
              {techError && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("technicianError")}</p>}
            </div>
          </fieldset>
          <p className="mt-3 text-xs text-slate-500">{t("notify")}</p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
            <button type="button" onClick={save} disabled={busy || !changed} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-40">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button>
          </div>
        </div>
      )}
    </RequestFrame>
  );
}
