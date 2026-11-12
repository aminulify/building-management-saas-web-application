"use client";

import { useTranslations } from "next-intl";
import { TenantFrame, type Person } from "./TenantFrame";
import type { ArchiveRow } from "./types";

/** View Archived Tenant Details: photo, contact, Tenant ID, move-out, reason, clearance, unpaid balance and the last residence with the landlord. */
export function ViewModal({ row, onClose, onMessage }: { row: ArchiveRow | null; onClose: () => void; onMessage: (p: Person) => void }) {
  const t = useTranslations("admin.previousTenants.details");
  return (
    <TenantFrame row={row} onClose={onClose} labelledBy="pt-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </TenantFrame>
  );
}
