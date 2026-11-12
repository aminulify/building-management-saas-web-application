"use client";

import { useTranslations } from "next-intl";
import { OwnerFrame } from "./OwnerFrame";
import type { OwnerDetails, OwnerRow } from "./types";

/** View Owner Details: profile, contact, plan, every property with its units and the full comment log. */
export function ViewModal({ row, onClose, onMessage }: { row: OwnerRow | null; onClose: () => void; onMessage: (d: OwnerDetails) => void }) {
  const t = useTranslations("admin.owners.details");
  return (
    <OwnerFrame row={row} onClose={onClose} labelledBy="ow-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </OwnerFrame>
  );
}
