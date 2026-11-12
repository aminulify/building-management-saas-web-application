"use client";

import { useTranslations } from "next-intl";
import { PropertyFrame } from "./PropertyFrame";
import type { ArchiveDetails, ArchiveRow } from "./types";

/** View Archived Property Details: name, units, address, date, reason, owner contact and the unit matrix. */
export function ViewModal({ row, onClose, onMessage }: { row: ArchiveRow | null; onClose: () => void; onMessage: (o: ArchiveDetails["owner"]) => void }) {
  const t = useTranslations("admin.previousProperties.details");
  return (
    <PropertyFrame row={row} onClose={onClose} labelledBy="pp-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </PropertyFrame>
  );
}
