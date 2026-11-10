"use client";

import { useState } from "react";
import { Download, Loader2, MessageCircle, Phone, Receipt as ReceiptIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { formatTaka } from "../../dashboard/format";
import { downloadReceiptPdf } from "../../rent/pdf";
import { QuickMessage } from "../QuickMessage";
import type { Receipt } from "../types";
import { Person, Row, StoryFrame } from "./Shell";
import { useDetail } from "./use-detail";

const METHOD_TONE: Record<string, string> = { BKASH: "bg-pink-100 text-pink-700", NAGAD: "bg-orange-100 text-orange-700", ROCKET: "bg-purple-100 text-purple-700", CASH: "bg-green-100 text-green-700", BANK: "bg-sky-100 text-sky-700", CARD: "bg-slate-100 text-slate-700" };

/** The full digital receipt for a "Rent Received" notification. */
export function PaymentStory({ paymentId }: { paymentId: string }) {
  const t = useTranslations("owner.notifications.story");
  const m = useTranslations("owner.notifications.methods");
  const locale = useLocale();
  const toast = useToast();
  const taka = formatTaka(locale);
  const d = useDetail<Receipt>(`/rent/payments/${paymentId}/receipt`);
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = d.data;
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));

  async function pdf() {
    if (!r) return;
    setBusy(true);
    try { await downloadReceiptPdf(r as never); } catch { toast("error", t("pdfError")); } finally { setBusy(false); }
  }

  return (
    <StoryFrame state={d.state} retry={d.retry}>
      {r && (
        <div className="space-y-4">
          <header className="pr-10">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-green-600"><ReceiptIcon className="size-4" aria-hidden />{t("receipt")}</p>
            <h2 id="nc-story-title" className="mt-1 text-2xl font-extrabold text-navy">{taka(Number(r.amount))}</h2>
            <p className="text-xs text-label">{t("receiptNo", { no: r.receiptNo })}</p>
          </header>
          {r.tenant && <Person name={r.tenant.fullName} sub={`@${r.tenant.username} · ${t("unitIn", { unit: r.unit, property: r.property })}`} avatar={r.tenant.avatarUrl} />}
          <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50/80 px-4">
            <Row label={t("method")}><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${METHOD_TONE[r.method] ?? METHOD_TONE.CARD}`}>{m(r.method as never)}</span></Row>
            {r.reference && <Row label={t("reference")}><span dir="ltr">{r.reference}</span></Row>}
            <Row label={t("paidOn")}>{date(r.issuedAt)}</Row>
            <Row label={t("forMonth")}>{r.billingMonth}</Row>
            <Row label={t("monthTotal")}>{taka(Number(r.recordTotal))}</Row>
            <Row label={t("balance")}><span className={Number(r.balance) > 0 ? "text-orange-600" : "text-green-600"}>{taka(Number(r.balance))}</span></Row>
          </dl>
          {write && r.tenant ? <QuickMessage tenantId={r.tenant.id} tenantName={r.tenant.fullName} hint={t("messageHint", { amount: taka(Number(r.amount)) })} onDone={() => setWrite(false)} /> : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {r.tenant?.phone ? <a href={`tel:${r.tenant.phone}`} className="btn btn-white h-11 text-sm"><Phone className="size-4 text-green-600" aria-hidden />{t("call")}</a> : <span className="btn btn-white h-11 cursor-not-allowed text-sm opacity-60" aria-disabled="true"><Phone className="size-4" aria-hidden />{t("noPhone")}</span>}
              <button type="button" onClick={() => setWrite(true)} disabled={!r.tenant} className="btn btn-white h-11 text-sm"><MessageCircle className="size-4 text-[#0A84F0]" aria-hidden />{t("message")}</button>
            </div>
          )}
          <button type="button" onClick={pdf} disabled={busy} className="btn btn-primary h-11 w-full text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}{t("pdf")}</button>
        </div>
      )}
    </StoryFrame>
  );
}
