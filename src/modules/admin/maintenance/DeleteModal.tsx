"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { RequestFrame } from "./RequestFrame";
import { ticket, type ReqRow } from "./types";

interface Props { row: ReqRow | null; busy: boolean; onClose: () => void; onConfirm: (r: ReqRow) => void }

/** Delete: the same full details on top; at the bottom the question with Delete or Cancel. */
export function DeleteModal({ row, busy, onClose, onConfirm }: Props) {
  const t = useTranslations("admin.maintenance.delete");
  return (
    <RequestFrame row={row} busy={busy} onClose={onClose} labelledBy="mr-delete" title={t("title")}>
      {() => row && (
        <div>
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><Trash2 className="size-5" /></span>
            <div><p className="font-bold text-red-700">{t("text", { ticket: ticket(row.ticketNo) })}</p><p className="mt-0.5 text-xs text-red-700/80">{t("note")}</p></div>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("no")}</button>
            <button type="button" onClick={() => onConfirm(row)} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("working") : t("yes")}</button>
          </div>
        </div>
      )}
    </RequestFrame>
  );
}
