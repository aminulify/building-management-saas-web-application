"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import { formatNumber, formatTaka } from "../dashboard/format";
import { downloadInvoicePdf } from "./invoice-pdf";
import type { InvoiceData, Payment, PaymentStatus } from "./types";

const PAGE = 5;
const TONE: Record<PaymentStatus, "success" | "warning" | "danger" | "vip"> = { SUCCESS: "success", PENDING_REVIEW: "warning", INITIATED: "warning", FAILED: "danger", REFUNDED: "vip" };

interface Props { state: "loading" | "ready" | "error"; payments: Payment[]; onRetry: () => void; onSupport: () => void }

export function BillingTable({ state, payments, onRetry, onSupport }: Props) {
  const t = useTranslations("owner.subscription.billing");
  const locale = useLocale();
  const toast = useToast();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(payments.length / PAGE));
  const rows = payments.slice((page - 1) * PAGE, page * PAGE);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(iso));

  async function download(p: Payment) {
    if (!p.invoice) return;
    setBusy(p.id);
    try { const inv = await authApi<InvoiceData>(`/invoices/${p.invoice.id}`); await downloadInvoicePdf(inv); }
    catch { toast("error", t("downloadError")); } finally { setBusy(null); }
  }

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-2xl border border-white/70 bg-white/65 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div><h2 className="text-base font-bold text-navy">{t("title")}</h2><p className="text-xs text-slate-500">{t("subtitle")}</p></div>
        <button type="button" onClick={onSupport} className="text-sm font-semibold text-[#0A84F0] underline-offset-4 hover:underline">{t("support")}</button>
      </header>

      {state === "loading" && <div aria-busy="true" className="space-y-2 px-5 pb-5"><span className="sr-only">{t("loading")}</span>{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div>}
      {state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center text-red-700"><AlertTriangle className="size-7" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={onRetry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      )}
      {state === "ready" && payments.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center"><FileText className="size-9 text-slate-300" aria-hidden /><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="max-w-xs text-sm text-slate-600">{t("emptyText")}</p></div>
      )}
      {state === "ready" && payments.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
                <tr><th className="px-5 py-3">{t("invoice")}</th><th className="px-3 py-3">{t("date")}</th><th className="px-3 py-3">{t("amount")}</th><th className="px-5 py-3 text-right">{t("status")}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-white/70">
                    <td className="px-5 py-3.5"><p className="font-bold text-navy">{p.invoice?.number ?? "—"}</p>{p.plan && <p className="text-xs text-slate-500">{locale === "bn" ? p.plan.nameBn : p.plan.nameEn}{p.cycle ? ` · ${t(`cycle.${p.cycle}`)}` : ""}</p>}</td>
                    <td className="px-3 py-3.5 text-slate-600">{date(p.verifiedAt ?? p.createdAt)}</td>
                    <td className="px-3 py-3.5 font-bold text-navy">{taka(Number(p.amount))}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2.5">
                        <StatusBadge tone={TONE[p.status]} dot>{t(`state.${p.status}`)}</StatusBadge>
                        {p.invoice && (
                          <button type="button" onClick={() => void download(p)} disabled={busy === p.id} aria-label={t("download", { number: p.invoice.number })} title={t("downloadTitle")} className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:-translate-y-0.5 hover:text-[#0A84F0] disabled:opacity-60 motion-reduce:hover:translate-y-0">
                            {busy === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                          </button>
                        )}
                      </div>
                      {p.status === "FAILED" && p.rejectionReason && <p className="mt-1 text-right text-xs text-red-600">{p.rejectionReason}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>{t("page", { page: n(page), pages: n(pages) })}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page <= 1} className="btn btn-white h-8 gap-1 px-3 text-xs"><ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{t("previous")}</button>
              <button type="button" onClick={() => setPage((v) => Math.min(pages, v + 1))} disabled={page >= pages} className="btn btn-white h-8 gap-1 px-3 text-xs">{t("next")}<ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden /></button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
