"use client";

import { Download, Hourglass, Loader2, Send } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { monthShort, STATE_STYLE, takaPlain } from "./logic";
import type { LedgerRow } from "./types";

interface Props {
  rows: LedgerRow[];
  /** a past stay has nothing left to send: its unpaid months are shown but cannot be paid here */
  canPay: boolean;
  invoiceBusy: string | null;
  onPay: (row: LedgerRow) => void;
  onInvoice: (row: LedgerRow) => void;
}

const action = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[0.68rem] font-extrabold uppercase tracking-wide transition-all duration-300";

/** Billing month, amount, status pill and the action: Send Paid Request, Pending Request, or Invoice. */
export function LedgerTable({ rows, canPay, invoiceBusy, onPay, onInvoice }: Props) {
  const t = useTranslations("tenant.history.ledger");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md">
      <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200/80 text-[0.68rem] font-bold uppercase tracking-wider text-navy">
            <th scope="col" className="px-3 py-3 sm:px-4">{t("month")}</th><th scope="col" className="px-3 py-3 sm:px-4">{t("amount")}</th>
            <th scope="col" className="px-3 py-3 sm:px-4">{t("status")}</th><th scope="col" className="px-3 py-3 sm:px-4 text-right">{t("action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.recordId} className="border-b border-slate-100 transition-colors duration-300 last:border-0 hover:bg-sky-50/50">
              <th scope="row" className="px-3 py-3 sm:px-4 font-medium text-slate-700">{monthShort(locale, r.month)}</th>
              <td className="px-3 py-3 sm:px-4 tabular-nums text-slate-700">{takaPlain(locale, Number(r.amount))}</td>
              <td className="px-3 py-3 sm:px-4">
                <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[r.state])}>
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />{t(`state.${r.state}`)}
                </span>
                {r.state === "UNPAID" && r.late && <span className="sr-only">{t("late")}</span>}
              </td>
              <td className="px-3 py-3 sm:px-4 text-right">
                {r.state === "PAID" && (
                  <button type="button" onClick={() => onInvoice(r)} disabled={invoiceBusy === r.recordId} aria-label={t("invoiceFor", { month: monthShort(locale, r.month) })} className={clsx(action, "bg-sky-100 text-[#0A84F0] hover:bg-sky-200")}>
                    {invoiceBusy === r.recordId ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}{t("invoice")}
                  </button>
                )}
                {r.state === "PENDING" && <span className={clsx(action, "cursor-default bg-yellow-50 text-yellow-700")}><Hourglass className="size-3.5" aria-hidden />{t("pendingRequest")}</span>}
                {r.state === "UNPAID" && canPay && (
                  <button type="button" onClick={() => onPay(r)} aria-label={t("sendFor", { month: monthShort(locale, r.month) })} className={clsx(action, "bg-[#0A84F0] text-white shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)] hover:bg-[#0873D6]")}>
                    <Send className="size-3.5" aria-hidden />{t("sendRequest")}
                  </button>
                )}
                {r.state === "UNPAID" && !canPay && <span className="text-xs font-medium text-slate-400">{t("closed")}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
