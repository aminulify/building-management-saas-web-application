"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatTaka } from "../dashboard/format";
import { formatDate } from "../tenants/format";
import { LEDGER_STYLE } from "./logic";
import type { LedgerRow } from "./types";

/** Month-by-month rent: due, paid, balance and one of Paid On Time / Paid Late / Defaulted. */
export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const t = useTranslations("owner.previousTenants.history");
  const locale = useLocale();
  const taka = formatTaka(locale);
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-600">{t("noLedger")}</p>;
  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-slate-200/80 bg-white/70">
      <table className="w-full min-w-[460px] text-left text-sm">
        <caption className="sr-only">{t("ledger")}</caption>
        <thead className="sticky top-0 bg-slate-100/90 text-[11px] uppercase tracking-wide text-navy backdrop-blur">
          <tr><th scope="col" className="px-3 py-2.5 font-bold">{t("cols.month")}</th><th scope="col" className="px-3 py-2.5 text-right font-bold">{t("cols.due")}</th><th scope="col" className="px-3 py-2.5 text-right font-bold">{t("cols.paid")}</th><th scope="col" className="px-3 py-2.5 font-bold">{t("cols.status")}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-200/60">
              <td className="px-3 py-2.5 font-medium text-navy">{month(r.billingMonth)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{taka(r.total)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{taka(r.paid)}{r.paidAt && <span className="block text-[10px] text-slate-400">{formatDate(locale, r.paidAt)}</span>}</td>
              <td className="px-3 py-2.5"><span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", LEDGER_STYLE[r.status])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`status.${r.status}`)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
