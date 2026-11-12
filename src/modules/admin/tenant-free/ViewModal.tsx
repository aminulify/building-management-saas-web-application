"use client";

import { useTranslations } from "next-intl";
import { FreeFrame } from "./FreeFrame";
import type { FreeDetails, FreeRow } from "./types";

/** View: the full profile, NID number, documents, whether owners can find this person, and the account log. */
export function ViewModal({ row, onClose, onMessage }: { row: FreeRow | null; onClose: () => void; onMessage: (d: FreeDetails) => void }) {
  const t = useTranslations("admin.tenantFree.details");
  return (
    <FreeFrame row={row} onClose={onClose} labelledBy="tf-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </FreeFrame>
  );
}
