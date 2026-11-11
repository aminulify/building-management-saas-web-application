"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, History as HistoryIcon, Home, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { PayModal } from "../dashboard/PayModal";
import { useTenantBase } from "../shell/TenantContext";
import { StayCard } from "./StayCard";
import { SummaryCards } from "./SummaryCards";
import { RECENT, mergeRows, monthShort, payTarget } from "./logic";
import type { History, LedgerRow, RecordsPage, Stay, Invoice } from "./types";

const STEP = 12;
interface More { rows: LedgerRow[]; hasMore: boolean; loading: boolean; error: boolean }

export function HistoryView() {
  const t = useTranslations("tenant.history");
  const locale = useLocale();
  const toast = useToast();
  const base = useTenantBase();
  const q = useAuthQuery<History>("/tenant/history");
  const [more, setMore] = useState<Record<string, More>>({});
  const [paying, setPaying] = useState<{ row: LedgerRow; stay: Stay } | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const data = q.data;

  // the landlord verifies payments on their side: look again every 30 s and when the tab comes back (never while a request is running)
  const busy = useRef(false);
  busy.current = q.fetching;
  const { reload } = q;
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !busy.current) reload(); };
    const id = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);

  // rows opened with "View All Receipts" take the fresh status of the rows the server just sent
  useEffect(() => {
    if (!data) return;
    setMore((cur) => {
      const next = { ...cur };
      for (const s of data.stays) if (next[s.id]) next[s.id] = { ...next[s.id]!, rows: mergeRows(next[s.id]!.rows, s.ledger.items) };
      return next;
    });
  }, [data]);

  async function viewAll(stay: Stay) {
    const cur = more[stay.id] ?? { rows: stay.ledger.items, hasMore: stay.ledger.hasMore, loading: false, error: false };
    if (!cur.hasMore && more[stay.id]) return;
    setMore((m) => ({ ...m, [stay.id]: { ...cur, loading: true, error: false } }));
    try {
      const r = await authApi<RecordsPage>(`/tenant/history/${stay.id}/records?offset=${cur.rows.length}&limit=${STEP}`);
      setMore((m) => ({ ...m, [stay.id]: { rows: [...cur.rows, ...r.items.filter((n) => !cur.rows.some((c) => c.recordId === n.recordId))], hasMore: r.hasMore, loading: false, error: false } }));
    } catch { setMore((m) => ({ ...m, [stay.id]: { ...cur, loading: false, error: true } })); }
  }
  const showLess = (stay: Stay) => setMore((m) => { const n = { ...m }; delete n[stay.id]; return n; });

  async function invoice(row: LedgerRow) {
    setInvoiceBusy(row.recordId);
    try {
      const inv = await authApi<Invoice>(`/tenant/rent/${row.recordId}/invoice`);
      const { downloadInvoicePdf } = await import("./invoice-pdf");
      await downloadInvoicePdf(inv);
      toast("success", t("toast.invoice", { month: monthShort(locale, row.month) }));
    } catch { toast("error", t("toast.invoiceError")); } finally { setInvoiceBusy(null); }
  }

  const s = data?.summary;
  const end = s?.firstRecordMonth ?? (s?.since ? s.since.slice(0, 7) : null);

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-96 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header">
        <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      {q.state === "loading" && !data && (
        <div aria-busy="true" className="space-y-5"><span className="sr-only">{t("loading")}</span>
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>
          <div className="skeleton h-[34rem] rounded-2xl" />
        </div>
      )}
      {q.state === "error" && !data && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {data && s && (
        <>
          <SummaryCards s={s} />
          {data.stays.length === 0 ? (
            <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
              <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600"><Home className="size-8" /></span>
              <h2 className="text-lg font-bold text-navy">{t("empty.title")}</h2>
              <p className="max-w-md text-sm text-slate-600">{t("empty.text")}</p>
              <Link href={`${base}/find-home` as never} className="btn btn-primary mt-1 h-11 px-6">{t("empty.cta")}</Link>
            </FadeIn>
          ) : (
            <>
              <div className="space-y-5">
                {data.stays.map((stay, i) => {
                  const m = more[stay.id];
                  return (
                    <StayCard
                      key={stay.id} stay={stay} index={i} rows={m ? m.rows : stay.ledger.items.slice(0, RECENT)} hasMore={m ? m.hasMore : stay.ledger.hasMore}
                      expanded={!!m} loadingMore={!!m?.loading} moreError={!!m?.error} invoiceBusy={invoiceBusy}
                      onPay={(row, st) => setPaying({ row, stay: st })} onInvoice={(r) => void invoice(r)} onMore={(st) => void viewAll(st)} onLess={showLess}
                    />
                  );
                })}
              </div>
              <FadeIn className="flex flex-col items-center gap-2 rounded-2xl border border-white/70 bg-white/60 px-4 py-10 text-center backdrop-blur-xl">
                <span aria-hidden className="grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><HistoryIcon className="size-6" /></span>
                <h2 className="text-lg font-bold text-navy">{t("end.title")}</h2>
                <p className="max-w-md text-sm text-slate-600">{end ? t("end.text", { month: monthShort(locale, end) }) : t("end.textNone")}</p>
              </FadeIn>
            </>
          )}
        </>
      )}

      <PayModal open={!!paying} next={paying ? payTarget(paying.row, paying.stay.payTo) : null} ownerName={paying?.stay.landlord?.fullName ?? ""} onClose={() => setPaying(null)} onSent={q.reload} />
    </div>
  );
}
