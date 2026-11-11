"use client";

import { Building2, ChevronDown, Clock, Loader2, MapPin, Receipt } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { LedgerTable } from "./LedgerTable";
import { checkIn, checkOut, monthShort, takaPlain } from "./logic";
import type { LedgerRow, Stay } from "./types";

interface Props {
  stay: Stay;
  rows: LedgerRow[];
  hasMore: boolean;
  expanded: boolean;
  loadingMore: boolean;
  moreError: boolean;
  invoiceBusy: string | null;
  index: number;
  onPay: (row: LedgerRow, stay: Stay) => void;
  onInvoice: (row: LedgerRow) => void;
  onMore: (stay: Stay) => void;
  onLess: (stay: Stay) => void;
}

/** One stay: building, rental period, check in / check out, unit details and the recent payment ledger. */
export function StayCard({ stay: s, rows, hasMore, expanded, loadingMore, moreError, invoiceBusy, index, onPay, onInvoice, onMore, onLess }: Props) {
  const t = useTranslations("tenant.history.stay");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const active = s.status === "ACTIVE";
  const out = checkOut(locale, s);
  const period = `${monthShort(locale, s.startDate)} - ${s.endDate ? monthShort(locale, s.endDate) : t("present")}`;

  return (
    <motion.article
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }} transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(index, 2) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      aria-label={s.property.name}
      className="rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Building2 className="size-6" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-navy" title={s.property.name}>{s.property.name}</h2>
            {s.property.addressLine && <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3 shrink-0" aria-hidden /><span className="truncate">{s.property.addressLine}</span></p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("period")}</p>
            <p className="text-xs text-slate-600">{period}</p>
          </div>
          <span className={clsx("rounded-md px-2.5 py-1 text-xs font-bold", active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600")}>{t(active ? "active" : "completed")}</span>
        </div>
      </header>

      <section className="mt-5" aria-label={t("entryExit")}>
        <h3 className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-label"><Clock className="size-3.5" aria-hidden />{t("entryExit")}</h3>
        <dl className="mt-2.5 space-y-2.5">
          <div className={clsx("border-l-4 pl-3", active ? "border-green-500" : "border-green-200")}><dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-label">{t("checkedIn")}</dt><dd className="text-base font-bold text-navy">{checkIn(locale, s)}</dd></div>
          <div className={clsx("border-l-4 pl-3", active ? "border-red-500" : "border-red-200")}><dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-label">{t("checkedOut")}</dt><dd className="text-base font-bold text-navy">{out ?? t("ongoing")}</dd></div>
        </dl>
      </section>

      <section className="mt-5 rounded-xl bg-slate-50/80 p-4" aria-label={t("unitDetails")}>
        <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-label">{t("unitDetails")}</h3>
        <dl className="mt-2 divide-y divide-slate-200/80 text-sm">
          <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-slate-600">{t("unitName")}</dt><dd className="font-semibold text-navy">{s.unit.unitNumber}</dd></div>
          <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-slate-600">{t("landlord")}</dt><dd className="text-right font-semibold text-navy">{s.landlord?.fullName ?? "-"}</dd></div>
          <div className="flex items-center justify-between gap-3 pt-2.5"><dt className="text-slate-600">{t("monthlyRent")}</dt><dd className="font-bold text-green-600">{takaPlain(locale, Number(s.rent))}</dd></div>
        </dl>
      </section>

      <section className="mt-5" aria-label={t("ledger")}>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-navy">{t("ledger")}</h3>
          {s.ledger.total > rows.length || expanded ? (
            <button type="button" onClick={() => (expanded && !hasMore ? onLess(s) : onMore(s))} disabled={loadingMore} aria-expanded={expanded} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A84F0] hover:underline disabled:opacity-60">
              {loadingMore ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : expanded && !hasMore ? <ChevronDown className="size-3.5 rotate-180" aria-hidden /> : <Receipt className="size-3.5" aria-hidden />}
              {expanded && !hasMore ? t("showLess") : t("viewAll")}
            </button>
          ) : null}
        </div>
        {rows.length === 0
          ? <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">{t("noRecords")}</p>
          : <LedgerTable rows={rows} canPay={active} invoiceBusy={invoiceBusy} onPay={(r) => onPay(r, s)} onInvoice={onInvoice} />}
        {moreError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{t("moreError")}</p>}
      </section>
    </motion.article>
  );
}
