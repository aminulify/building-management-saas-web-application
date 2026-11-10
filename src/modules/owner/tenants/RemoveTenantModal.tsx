"use client";

import { useState } from "react";
import { AlertCircle, Loader2, UserMinus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatTaka } from "../dashboard/format";
import type { DirectoryRow } from "./types";

interface Props { row: DirectoryRow | null; onClose: () => void; onRemoved: () => void }

/** "Are you sure?" Ends the tenancy today: the unit becomes Vacant and the tenant moves to Previous Tenants. */
export function RemoveTenantModal({ row, onClose, onRemoved }: Props) {
  const t = useTranslations("owner.tenants.remove");
  const locale = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await authApi(`/tenancies/${row.id}/end`, { method: "POST", body: { reason: "Removed by the owner from the Tenants Directory" } });
      toast("success", t("done", { name: row.tenant?.fullName ?? "", unit: row.unit.unitNumber }));
      setBusy(false);
      onRemoved();
      onClose();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "INVALID_STATE") setError(t("errors.ended"));
      else if (e instanceof ApiError && e.code === "NETWORK") setError(t("errors.network"));
      else setError(t("errors.generic"));
    }
  }

  return (
    <Modal open={row !== null} onClose={() => { setError(null); onClose(); }} labelledBy="remove-tenant-title" busy={busy} maxWidth="max-w-[460px]">
      {row && (
        <div className="text-center">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><UserMinus className="size-6" /></span>
          <h2 id="remove-tenant-title" className="mt-3 text-2xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("text", { name: row.tenant?.fullName ?? "", unit: row.unit.unitNumber, property: row.property.name })}</p>
          <p className="mt-1 text-xs text-label">{t("note")}</p>
          {row.overdueAmount && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{t("owes", { amount: formatTaka(locale)(Number(row.overdueAmount)) })}</p>}
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-11 sm:min-w-32">{t("cancel")}</button>
            <button type="button" onClick={confirm} disabled={busy} aria-busy={busy || undefined} className="btn h-11 text-white sm:min-w-40" style={{ background: "linear-gradient(135deg,#ef4444 0%,#be123c 100%)" }}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserMinus className="size-4" aria-hidden />}{busy ? t("removing") : t("yes")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
