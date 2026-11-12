"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { DocReview } from "./DocReview";
import { TenantFrame } from "./TenantFrame";
import type { DocKind, Person, TenantDetails, TenantRow, TenantState } from "./types";

export interface EditInput { unitId?: string; endDate?: string; status?: TenantState }
const OPTIONS: { id: TenantState; tone: string }[] = [
  { id: "ACTIVE", tone: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { id: "NOTICE_GIVEN", tone: "border-amber-300 bg-amber-50 text-amber-700" },
];

interface Props { row: TenantRow | null; busy: boolean; onClose: () => void; onSave: (r: TenantRow, input: EditInput) => void; onMessage: (p: Person) => void; onChanged: () => void }
type Section = "tenancy" | DocKind;
const SECTIONS: Section[] = ["tenancy", "NID_FRONT", "NID_BACK", "AGREEMENT"];

function Form({ row, d, busy, onClose, onSave }: { row: TenantRow; d: TenantDetails | null; busy: boolean; onClose: () => void; onSave: Props["onSave"] }) {
  const t = useTranslations("admin.tenants.edit");
  const [unitId, setUnitId] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<TenantState>(row.state);
  const [error, setError] = useState(false);
  const iso = (v: string | null) => (v ? v.slice(0, 10) : "");

  useEffect(() => { if (d) { setUnitId(d.residence.unitId); setEndDate(iso(d.endDate)); setStatus(d.state); setError(false); } }, [d]);
  if (!d) return null;

  const min = iso(d.startDate);
  const changed = unitId !== d.residence.unitId || endDate !== iso(d.endDate) || status !== d.state;
  const units = [{ id: d.residence.unitId, label: `${d.residence.property} · ${d.residence.unit}` }, ...d.unitChoices.map((u) => ({ id: u.id, label: `${u.property} · ${u.unit}` }))];
  function save() {
    if (endDate && endDate <= min) { setError(true); return; }
    onSave(row, { ...(unitId !== d!.residence.unitId ? { unitId } : {}), ...(endDate && endDate !== iso(d!.endDate) ? { endDate } : {}), ...(status !== d!.state ? { status } : {}) });
  }
  const field = "glass-input mt-2 h-11 w-full rounded-lg px-3 text-sm font-semibold text-navy outline-none";
  return (
    <div>
      <h3 className="text-sm font-bold text-navy">{t("sectionTitle")}</h3>
      <p className="text-xs text-slate-500">{t("subtitle")}</p>
      <fieldset disabled={busy} className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tn-unit" className="block text-xs font-bold uppercase tracking-wider text-label">{t("unit")}</label>
          <select id="tn-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} className={field}>{units.map((u) => <option key={u.id} value={u.id}>{u.label}{u.id === d.residence.unitId ? ` (${t("current")})` : ""}</option>)}</select>
          <p className="mt-1 text-xs text-slate-500">{d.unitChoices.length === 0 ? t("noFreeUnits") : t("freeUnits", { n: d.unitChoices.length })}</p>
        </div>
        <div>
          <label htmlFor="tn-end" className="block text-xs font-bold uppercase tracking-wider text-label">{t("endDate")}</label>
          <input id="tn-end" type="date" value={endDate} min={min} onChange={(e) => { setEndDate(e.target.value); setError(false); }} className={field} data-invalid={error || undefined} aria-invalid={error || undefined} />
          {error && <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("endError")}</p>}
        </div>
        <div className="sm:col-span-2">
          <span className="block text-xs font-bold uppercase tracking-wider text-label">{t("status")}</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("status")}>
            {OPTIONS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={status === o.id} onClick={() => setStatus(o.id)} className={clsx("flex h-11 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-all duration-300", status === o.id ? o.tone + " shadow-md" : "border-slate-200 bg-white/80 text-slate-600 hover:border-[#48BDFA]")}>
                <i aria-hidden className={clsx("size-3 rounded-full border-2", status === o.id ? "border-current bg-current" : "border-slate-300")} />{t(`option.${o.id}`)}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-slate-500">{t("notify")}</p>
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
        <button type="button" onClick={save} disabled={busy || !changed} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-40">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button>
      </div>
    </div>
  );
}

/** Edit Tenant: full profile on top; at the bottom pick what to work on: the tenancy (unit, lease end, status) or one document (NID front, NID back, agreement) to verify or reject. */
export function EditModal({ row, busy, onClose, onSave, onMessage, onChanged }: Props) {
  const t = useTranslations("admin.tenants.edit");
  const td = useTranslations("admin.tenants.docs");
  const [section, setSection] = useState<Section>("tenancy");
  useEffect(() => { if (row) setSection("tenancy"); }, [row]);
  return (
    <TenantFrame row={row} busy={busy} onClose={onClose} labelledBy="tn-edit" title={t("title")} onMessage={onMessage}>
      {(d, reload) => row && (
        <div>
          <div role="tablist" aria-label={t("sectionTitle")} className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/70 bg-white/60 p-1">
            {SECTIONS.map((x) => {
              const doc = x === "tenancy" ? null : d?.documents[x === "NID_FRONT" ? "nidFront" : x === "NID_BACK" ? "nidBack" : "agreement"];
              return (
                <button key={x} type="button" role="tab" aria-selected={section === x} onClick={() => setSection(x)} className={clsx("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-300", section === x ? "bg-[#0A84F0] text-white shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)]" : "text-slate-600 hover:text-[#0A84F0]")}>
                  {x === "tenancy" ? t("tenancyTab") : td(`kind.${x}`)}
                  {doc && doc.status === "PENDING" && <i aria-hidden className="ml-1.5 inline-block size-2 rounded-full bg-amber-400" />}
                </button>
              );
            })}
          </div>
          {section === "tenancy" ? <Form row={row} d={d} busy={busy} onClose={onClose} onSave={onSave} /> : d ? <DocReview endpoint={`/admin/active-tenants/${row.id}/documents`} kind={section} doc={d.documents[section === "NID_FRONT" ? "nidFront" : section === "NID_BACK" ? "nidBack" : "agreement"]} onChanged={() => { reload(); onChanged(); }} /> : null}
        </div>
      )}
    </TenantFrame>
  );
}
