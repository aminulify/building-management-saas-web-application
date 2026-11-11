"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import type { PastRow } from "./types";

interface Props { row: PastRow | null; onClose: () => void; onRemoved: () => void }

/** Takes a row off the Previous Tenants list. The agreement and its rent records stay in the books. */
export function RemoveRecordModal({ row, onClose, onRemoved }: Props) {
  const t = useTranslations("owner.previousTenants.remove");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!row) return;
    setBusy(true); setError(null);
    try {
      await authApi(`/tenancies/${row.id}/record`, { method: "DELETE" });
      toast("success", t("done", { name: row.tenant?.fullName ?? "" }));
      setBusy(false); onRemoved(); onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError && e.code === "NETWORK" ? t("errors.network") : t("errors.generic"));
    }
  }

  return (
    <Modal open={row !== null} onClose={() => { setError(null); onClose(); }} labelledBy="remove-past-title" busy={busy} maxWidth="max-w-[460px]">
      {row && (
        <div className="text-center">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><Trash2 className="size-6" /></span>
          <h2 id="remove-past-title" className="mt-3 text-2xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("text", { name: row.tenant?.fullName ?? "", unit: row.unit.unitNumber, property: row.property.name })}</p>
          <p className="mt-1 text-xs text-label">{t("note")}</p>
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
            <button type="button" onClick={() => void confirm()} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-40">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("removing") : t("confirm")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
