"use client";

import { useTranslations } from "next-intl";
import { OwnerFrame } from "./OwnerFrame";
import type { ArchiveDetails, ArchiveRow } from "./types";

/** View Archived Owner Details: photo, contact, Owner ID, departure, reason, status log and the managed-property archive. */
export function ViewModal({ row, onClose, onMessage }: { row: ArchiveRow | null; onClose: () => void; onMessage: (d: ArchiveDetails) => void }) {
  const t = useTranslations("admin.previousOwners.details");
  return (
    <OwnerFrame row={row} onClose={onClose} labelledBy="po-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </OwnerFrame>
  );
}
