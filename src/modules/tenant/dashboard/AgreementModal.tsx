"use client";

import { AlertTriangle, Download, FileText, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatDate } from "../../owner/tenants/format";
import type { TenantDashboard } from "./types";

type Tenancy = NonNullable<TenantDashboard["tenancy"]>;
interface Props { open: boolean; tenancy: Tenancy | null; tenantName: string; onClose: () => void }

/** The signed lease between tenant and owner: preview in the window, and a download button. */
export function AgreementModal({ open, tenancy, tenantName, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="agr-title" maxWidth="max-w-[720px]">
      {open && tenancy && <Body tenancy={tenancy} tenantName={tenantName} onClose={onClose} />}
    </Modal>
  );
}

function Body({ tenancy, tenantName, onClose }: { tenancy: Tenancy; tenantName: string; onClose: () => void }) {
  const t = useTranslations("tenant.dashboard.agreement");
  const locale = useLocale();
  const q = useAuthQuery<{ url: string }>(tenancy.hasAgreementDocument ? `/tenancies/${tenancy.id}/agreement` : null);
  const url = q.data?.url;

  return (
    <div>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-yellow-400 text-yellow-950"><FileText className="size-5" /></span>
        <div><h2 id="agr-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
          <p className="text-xs text-slate-600">{t("between", { tenant: tenantName, owner: tenancy.owner?.fullName ?? "—" })}</p></div>
      </header>
      <p className="mt-3 text-xs text-slate-600">{tenancy.property.name} · {t("unit", { no: tenancy.unit.unitNumber })} · {formatDate(locale, tenancy.startDate)} – {tenancy.endDate ? formatDate(locale, tenancy.endDate) : t("present")}</p>

      <div className="mt-4">
        {!tenancy.hasAgreementDocument && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center"><FileText className="size-9 text-slate-400" aria-hidden /><p className="font-bold text-navy">{t("noneTitle")}</p><p className="max-w-sm text-sm text-slate-600">{t("noneText")}</p></div>
        )}
        {tenancy.hasAgreementDocument && q.state === "loading" && <div aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="skeleton h-72 w-full rounded-xl" /></div>}
        {tenancy.hasAgreementDocument && q.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-8 text-center text-red-700"><AlertTriangle className="size-7" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {url && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {tenancy.agreementType === "pdf" ? <iframe src={url} title={t("previewTitle")} className="h-[min(60vh,32rem)] w-full" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={t("previewTitle")} className="max-h-[60vh] w-full object-contain" />}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onClose} className="btn btn-white h-12 sm:min-w-32">{t("close")}</button>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" download className="btn btn-primary h-12 sm:min-w-48"><Download className="size-4" aria-hidden />{t("download")}</a>
          : <button type="button" disabled className="btn btn-primary h-12 sm:min-w-48"><Download className="size-4" aria-hidden />{t("download")}</button>}
      </div>
    </div>
  );
}
