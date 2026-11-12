"use client";

import { useTranslations } from "next-intl";
import { RequestFrame } from "./RequestFrame";
import type { ReqRow } from "./types";

/** View Request Details: everything about the request, its apartment and the people involved. */
export function DetailsModal({ row, onClose }: { row: ReqRow | null; onClose: () => void }) {
  const t = useTranslations("admin.maintenance.details");
  return (
    <RequestFrame row={row} onClose={onClose} labelledBy="mr-view" title={t("title")}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </RequestFrame>
  );
}
