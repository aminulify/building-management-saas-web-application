"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import type { PropertyRow } from "./types";

/** Same codes as the server (modules/properties/archive-reasons.ts). */
const REASONS = ["SOLD_PROPERTY", "NOT_INTERESTED", "BUILDING_DEMOLISHED", "RENOVATION", "DUPLICATE_ENTRY", "MOVED_PLATFORM", "OTHER"] as const;

interface Props { property: PropertyRow | null; onClose: () => void; onDeleted: (id: string) => void }

/** "Are you sure?" The property is archived (hidden everywhere, history kept). Blocked while tenants are still living in it. */
export function DeleteModal({ property, onClose, onDeleted }: Props) {
  const t = useTranslations("owner.properties.delete");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<(typeof REASONS)[number] | "">("");
  const [note, setNote] = useState("");
  useEffect(() => { if (property) { setCode(""); setNote(""); setError(null); } }, [property]);

  async function confirm() {
    if (!property) return;
    if (!code) { setError(t("errors.reasonPick")); return; }
    if (code === "OTHER" && note.trim().length < 3) { setError(t("errors.reasonNote")); return; }
    setBusy(true);
    setError(null);
    try {
      await authApi(`/properties/${property.id}/archive`, { method: "POST", body: { reasonCode: code, ...(note.trim().length >= 3 ? { reason: note.trim() } : {}) } });
      toast("success", t("done", { name: property.name }));
      onDeleted(property.id);
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "INVALID_STATE") setError(t("errors.activeTenants", { count: Number((e.details as { count?: number } | undefined)?.count ?? 1) }));
      else if (e instanceof ApiError && e.code === "NETWORK") setError(t("errors.network"));
      else setError(t("errors.generic"));
    }
  }

  return (
    <Modal open={property !== null} onClose={() => { setError(null); onClose(); }} labelledBy="delete-title" busy={busy} maxWidth="max-w-[480px]">
      {property && (
        <div className="text-center">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><Trash2 className="size-6" /></span>
          <h2 id="delete-title" className="mt-3 text-2xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("text", { name: property.name })}</p>
          <p className="mt-1 text-xs text-label">{t("note")}</p>
          <div className="mt-4 space-y-3 text-left">
            <div>
              <label htmlFor="del-reason" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{t("reasonLabel")}</label>
              <select id="del-reason" value={code} onChange={(e) => { setCode(e.target.value as (typeof REASONS)[number] | ""); setError(null); }} disabled={busy} className="glass-input h-11 w-full rounded-xl px-3 text-sm font-semibold text-navy outline-none">
                <option value="">{t("reasonPlaceholder")}</option>
                {REASONS.map((x) => <option key={x} value={x}>{t(`reasons.${x}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="del-note" className="mb-1 block text-xs font-bold uppercase tracking-wider text-label">{code === "OTHER" ? t("noteRequired") : t("noteOptional")}</label>
              <textarea id="del-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} disabled={busy} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
            </div>
          </div>
          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-11 sm:min-w-32">{t("cancel")}</button>
            <button type="button" onClick={confirm} disabled={busy} aria-busy={busy || undefined} className="btn h-11 text-white sm:min-w-36" style={{ background: "linear-gradient(135deg,#ef4444 0%,#be123c 100%)" }}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("deleting") : t("yes")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
