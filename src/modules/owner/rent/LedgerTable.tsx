"use client";

import { FileText, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { formatTaka } from "../dashboard/format";
import { formatDate } from "../tenants/format";
import { monthLabel } from "./period";
import type { LedgerItem } from "./types";

interface Props { rows: LedgerItem[]; fetching: boolean; receiptBusy: string | null; onReceipt: (r: LedgerItem) => void }

const TONE = { PAID: "success", UNPAID: "warning", OVERDUE: "danger" } as const;

function Status({ r }: { r: LedgerItem }) {
  const t = useTranslations("owner.rent.status");
  return <StatusBadge tone={TONE[r.status]} dot>{t(r.status)}{r.partial && <span className="font-normal opacity-80"> · {t("partial")}</span>}</StatusBadge>;
}

function Receipt({ r, busy, onReceipt }: { r: LedgerItem; busy: boolean; onReceipt: Props["onReceipt"] }) {
  const t = useTranslations("owner.rent.receipt");
  const has = !!r.receiptPaymentId;
  return (
    <button
      type="button" disabled={!has || busy} onClick={() => onReceipt(r)} aria-busy={busy || undefined}
      aria-label={has ? `${t("download")}: ${r.unit}` : `${t("none")}: ${r.unit}`} title={has ? t("download") : t("none")}
      className={clsx("grid size-9 place-items-center rounded-lg border transition-all duration-300", has ? "border-sky-200 bg-sky-100/90 text-sky-600 hover:-translate-y-0.5 hover:bg-sky-200 hover:shadow-md motion-reduce:hover:translate-y-0" : "cursor-not-allowed border-slate-200 bg-slate-100/80 text-slate-400")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
    </button>
  );
}

/** Desktop/tablet: glass table. Phones: one card per rent record. */
export function LedgerTable({ rows, fetching, receiptBusy, onReceipt }: Props) {
  const t = useTranslations("owner.rent");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const taka = formatTaka(locale);
  const item = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: reduce ? 0 : -16 }, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.03 } });
  const who = (r: LedgerItem) => (
    <div>
      <p className="font-bold text-navy">{t("unitLabel", { no: r.unit })}</p>
      <p className="mt-0.5 text-xs text-slate-600">{r.tenant ?? "—"}</p>
      <p className="text-[11px] text-slate-500">{r.property}</p>
      {r.carriedOver && <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{t("carriedOver", { month: monthLabel(locale, r.billingMonth) })}</span>}
    </div>
  );
  const amount = (r: LedgerItem) => (
    <div className="tabular-nums"><p className="font-bold text-navy">{taka(Number(r.total))} <span className="text-[10px] font-normal text-slate-500">{t("perMonth")}</span></p>{r.status !== "PAID" && Number(r.paid) > 0 && <p className="text-[11px] text-slate-500">{t("paidSoFar", { amount: taka(Number(r.paid)) })}</p>}</div>
  );

  return (
    <div className={clsx("transition-opacity duration-300", fetching && "opacity-60")}>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">{t("history")}</caption>
          <thead className="bg-slate-100/60 text-xs uppercase tracking-wide text-navy">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">{t("cols.tenant")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.due")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.amount")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.status")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.paidDate")}</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">{t("cols.receipt")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.tr key={r.recordId} layout={!reduce} {...item(i)} className="border-t border-slate-200/60 transition-colors duration-300 hover:bg-white/80">
                  <td className="px-4 py-3">{who(r)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatDate(locale, r.dueDate)}</td>
                  <td className="px-3 py-3">{amount(r)}</td>
                  <td className="px-3 py-3"><Status r={r} /></td>
                  <td className="px-3 py-3 text-xs text-slate-600">{r.paidAt ? formatDate(locale, r.paidAt) : "–"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Receipt r={r} busy={receiptBusy === r.recordId} onReceipt={onReceipt} /></div></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.li key={r.recordId} layout={!reduce} {...item(i)} className="rounded-xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">{who(r)}<Status r={r} /></div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>{amount(r)}<p className="mt-1 text-[11px] text-slate-500">{t("dueOn", { date: formatDate(locale, r.dueDate) })}{r.paidAt ? ` · ${t("paidOn", { date: formatDate(locale, r.paidAt) })}` : ""}</p></div>
                <Receipt r={r} busy={receiptBusy === r.recordId} onReceipt={onReceipt} />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
