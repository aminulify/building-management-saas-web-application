"use client";

import { useTranslations } from "next-intl";
import { TenantFrame } from "./TenantFrame";
import type { Person, TenantRow } from "./types";

/** View Tenant Details: profile, contact, residence, rent, lease, NID status and the owner. */
export function ViewModal({ row, onClose, onMessage }: { row: TenantRow | null; onClose: () => void; onMessage: (p: Person) => void }) {
  const t = useTranslations("admin.tenants.details");
  return (
    <TenantFrame row={row} onClose={onClose} labelledBy="tn-view" title={t("title")} onMessage={onMessage}>
      {() => <div className="flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>}
    </TenantFrame>
  );
}
