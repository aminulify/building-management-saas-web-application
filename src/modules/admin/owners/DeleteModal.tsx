"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { OwnerFrame } from "./OwnerFrame";
import type { OwnerDetails, OwnerRow } from "./types";

interface Props { row: OwnerRow | null; busy: boolean; onClose: () => void; onConfirm: (r: OwnerRow) => void; onMessage: (d: OwnerDetails) => void }

/** Delete Owner & Move to Archive: the full profile on top; at the bottom the question with Yes or Cancel. */
export function DeleteModal({ row, busy, onClose, onConfirm, onMessage }: Props) {
  const t = useTranslations("admin.owners.delete");
  return (
    <OwnerFrame row={row} busy={busy} onClose={onClose} labelledBy="ow-delete" title={t("title")} onMessage={onMessage}>
      {(d) => row && (
        <div>
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><Trash2 className="size-5" /></span>
            <div>
              <p className="font-bold text-red-700">{t("text")}</p>
              <p className="mt-0.5 text-xs text-red-700/80">{t("note")}</p>
              {d && (d.totals.properties > 0 || d.market.forSale > 0) && <p className="mt-1 text-xs font-semibold text-red-700">{t("impact", { properties: d.totals.properties, occupied: d.totals.occupied, listings: d.market.forSale })}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("no")}</button>
            <button type="button" onClick={() => onConfirm(row)} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("working") : t("yes")}</button>
          </div>
        </div>
      )}
    </OwnerFrame>
  );
}
