"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import type { Issue } from "./types";

interface Props { issue: Issue | null; busy: boolean; onClose: () => void; onConfirm: (issue: Issue) => void }

/** Asks before a request is removed for good. */
export function DeleteRequestModal({ issue, busy, onClose, onConfirm }: Props) {
  const t = useTranslations("tenant.maintenance.delete");
  return (
    <Modal open={!!issue} onClose={onClose} labelledBy="dr-title" busy={busy} maxWidth="max-w-[440px]">
      {issue && (
        <div className="pt-1 text-center">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-100 text-red-500"><Trash2 className="size-7" /></span>
          <h2 id="dr-title" className="mt-3 text-xl font-bold text-navy">{t("title")}</h2>
          <p className="mt-2 text-sm text-slate-600">{t("text")}</p>
          <p className="mt-2 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-navy" title={issue.title}>{issue.title}</p>
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
            <button type="button" onClick={onClose} disabled={busy} data-autofocus className="btn btn-white h-11 px-7 text-sm">{t("cancel")}</button>
            <button type="button" onClick={() => onConfirm(issue)} disabled={busy} className="btn btn-danger h-11 px-7 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{t("confirm")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
