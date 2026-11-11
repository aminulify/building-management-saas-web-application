"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Eye, FileText, Loader2, PenLine, RefreshCw, UploadCloud } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { Link } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatTaka } from "../dashboard/format";
import { formatDate } from "../tenants/format";
import { Avatar } from "../units/TenantPicker";
import { DOC_TYPES, checkFile } from "./logic";
import { uploadPrivate } from "./upload";
import type { AgreementRow } from "./types";

interface Props { open: boolean; onClose: () => void; onChanged: () => void }
interface Viewing { row: AgreementRow; url: string }

/** Active tenants' lease agreements: view the PDF or picture, download it, upload or replace it, ask the tenant to sign. */
export function AgreementsModal({ open, onClose, onChanged }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="agr-title" maxWidth="max-w-[720px]">
      {open && <Body onClose={onClose} onChanged={onChanged} />}
    </Modal>
  );
}

function Body({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("owner.profile.agreements");
  const locale = useLocale();
  const toast = useToast();
  const list = useAuthQuery<AgreementRow[]>("/tenancies/agreements");
  const [busy, setBusy] = useState<{ id: string; what: "view" | "upload" | "sign" } | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<AgreementRow | null>(null);

  const fail = (e: unknown) => toast("error", t(e instanceof ApiError && e.code === "NETWORK" ? "errors.network" : "errors.generic"));

  async function view(row: AgreementRow) {
    setBusy({ id: row.id, what: "view" });
    try { const r = await authApi<{ url: string }>(`/tenancies/${row.id}/agreement`); setViewing({ row, url: r.url }); } catch (e) { fail(e); }
    setBusy(null);
  }
  async function upload(file: File | undefined) {
    const row = target.current;
    if (!file || !row) return;
    const bad = checkFile(file, DOC_TYPES, 10);
    if (bad) { toast("error", t(bad === "type" ? "errors.type" : "errors.size")); return; }
    setBusy({ id: row.id, what: "upload" });
    try {
      const key = await uploadPrivate("AGREEMENT", file, file.type);
      await authApi(`/tenancies/${row.id}/agreement`, { method: "POST", body: { storageKey: key } });
      toast("success", t("uploaded", { name: row.tenant?.fullName ?? "" }));
      list.reload(); onChanged();
    } catch (e) { fail(e); }
    setBusy(null);
  }
  async function sign(row: AgreementRow) {
    setBusy({ id: row.id, what: "sign" });
    try {
      await authApi(`/tenancies/${row.id}/signature-request`, { method: "POST" });
      toast("success", t("signRequested", { name: row.tenant?.fullName ?? "" }));
      list.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") toast("error", t("errors.signTooSoon")); else fail(e);
    }
    setBusy(null);
  }

  if (viewing) {
    const { row, url } = viewing;
    return (
      <div>
        <h2 id="agr-title" className="sr-only">{t("title")}</h2>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-10">
          <button type="button" onClick={() => setViewing(null)} className="btn btn-white h-10 px-3 text-sm"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("back")}</button>
          <a href={url} target="_blank" rel="noopener noreferrer" download className="btn btn-primary h-10 px-4 text-sm"><Download className="size-4" aria-hidden />{t("download")}</a>
        </div>
        <p className="mt-3 text-sm font-bold text-navy">{row.tenant?.fullName} · {row.property.name} · {t("unit", { no: row.unit.unitNumber })}</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {row.docType === "pdf" ? <iframe src={url} title={t("viewerTitle")} className="h-[min(60vh,32rem)] w-full" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={t("viewerTitle")} className="max-h-[60vh] w-full object-contain" />}
        </div>
        <p className="mt-2 text-xs text-label">{t("linkNote")}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-center gap-3 pr-10">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><FileText className="size-5" /></span>
        <div><h2 id="agr-title" className="text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div>
      </header>
      <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="mt-4 max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto pr-1" aria-busy={list.state === "loading" || undefined}>
        {list.state === "loading" && [0, 1, 2].map((i) => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
        {list.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-8 text-center text-red-700"><AlertTriangle className="size-7" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={list.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {list.state === "ready" && list.data?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center"><FileText className="size-9 text-slate-400" aria-hidden /><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="max-w-xs text-sm text-slate-600">{t("emptyText")}</p>
            <Link href={"/owner/tenants" as never} onClick={onClose} className="btn btn-primary mt-1 h-10 px-5 text-sm">{t("goTenants")}</Link></div>
        )}
        {list.data?.map((r) => {
          const mine = busy?.id === r.id ? busy.what : null;
          const sig = r.signatureRequestedAt;
          return (
            <article key={r.id} className="rounded-xl border border-white/70 bg-white/70 p-4 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={r.tenant?.fullName ?? "?"} url={r.tenant?.avatarUrl} size="size-11" />
                <div className="min-w-0 flex-1"><p className="truncate font-bold text-navy">{r.tenant?.fullName ?? "—"}</p><p className="text-xs text-slate-600">{r.property.name} · {t("unit", { no: r.unit.unitNumber })}</p></div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${r.hasDocument ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>{r.hasDocument ? t("hasFile") : t("noFile")}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{formatDate(locale, r.startDate)} – {formatDate(locale, r.endDate)} · {formatTaka(locale)(Number(r.rent))}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.hasDocument && <button type="button" onClick={() => void view(r)} disabled={!!busy} className="btn btn-white h-9 px-3 text-xs">{mine === "view" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}{t("view")}</button>}
                <button type="button" onClick={() => { target.current = r; picker.current?.click(); }} disabled={!!busy} className="btn btn-white h-9 px-3 text-xs">{mine === "upload" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UploadCloud className="size-3.5" aria-hidden />}{r.hasDocument ? t("replace") : t("upload")}</button>
                {r.hasDocument && <button type="button" onClick={() => void sign(r)} disabled={!!busy} className="btn btn-primary h-9 px-3 text-xs">{mine === "sign" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <PenLine className="size-3.5" aria-hidden />}{sig ? t("signAgain") : t("sign")}</button>}
              </div>
              {sig && <p className="mt-2 text-[11px] font-medium text-sky-700">{t("signRequestedOn", { date: formatDate(locale, sig) })}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
