"use client";

import { Eye, Mail, MessageSquare, Pencil, Phone, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { formatNumber, formatTaka } from "../dashboard/format";
import { Avatar } from "../units/TenantPicker";
import { daysUntil, formatDate, formatPhone } from "./format";
import { statusTone } from "./schema";
import type { DirectoryRow } from "./types";

interface Props {
  rows: DirectoryRow[];
  fetching: boolean;
  onView: (r: DirectoryRow) => void;
  onMessage: (r: DirectoryRow) => void;
  onEdit: (r: DirectoryRow) => void;
  onRemove: (r: DirectoryRow) => void;
}

function Actions({ r, onView, onMessage, onEdit, onRemove }: Omit<Props, "rows" | "fetching"> & { r: DirectoryRow }) {
  const t = useTranslations("owner.tenants.actions");
  const name = r.tenant?.fullName ?? "";
  const base = "grid size-9 place-items-center rounded-lg border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0";
  const items = [
    { key: "view", icon: Eye, cls: "border-slate-200 bg-slate-100/80 text-slate-500 hover:bg-slate-200", on: onView },
    { key: "message", icon: MessageSquare, cls: "border-sky-200 bg-sky-100/80 text-sky-600 hover:bg-sky-200", on: onMessage },
    { key: "edit", icon: Pencil, cls: "border-emerald-200 bg-emerald-100/80 text-emerald-600 hover:bg-emerald-200", on: onEdit },
    { key: "remove", icon: Trash2, cls: "border-red-200 bg-red-100/80 text-red-600 hover:bg-red-200", on: onRemove },
  ] as const;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {items.map(({ key, icon: Icon, cls, on }) => (
        <button key={key} type="button" onClick={() => on(r)} aria-label={`${t(key)}: ${name}`} title={t(key)} className={clsx(base, cls)}><Icon className="size-4" aria-hidden /></button>
      ))}
    </div>
  );
}

function Lease({ r }: { r: DirectoryRow }) {
  const t = useTranslations("owner.tenants");
  const locale = useLocale();
  const left = daysUntil(r.endDate);
  const n = formatNumber(locale);
  return (
    <div>
      <p className="text-xs font-medium leading-snug text-navy">{formatDate(locale, r.startDate)} – {formatDate(locale, r.endDate)}</p>
      {left !== null && left < 0 && <p className="mt-0.5 text-[11px] font-semibold text-red-600">{t("leaseExpired", { days: n(Math.abs(left)) })}</p>}
      {left !== null && left >= 0 && r.leaveSoon && <p className="mt-0.5 text-[11px] font-semibold text-amber-600">{left === 0 ? t("endsToday") : t("endsIn", { days: n(left) })}</p>}
    </div>
  );
}

function Status({ r }: { r: DirectoryRow }) {
  const t = useTranslations("owner.tenants.status");
  const locale = useLocale();
  return (
    <div>
      <StatusBadge tone={statusTone[r.status]} dot>{t(r.status)}</StatusBadge>
      {r.status === "OVERDUE" && r.overdueAmount && <p className="mt-1 text-[11px] font-semibold text-red-600">{t("owes", { amount: formatTaka(locale)(Number(r.overdueAmount)) })}</p>}
    </div>
  );
}

function Contact({ r }: { r: DirectoryRow }) {
  return (
    <div className="space-y-1 text-[11px] text-slate-600">
      <p className="flex items-center gap-1.5"><Mail className="size-3 shrink-0 text-slate-400" aria-hidden /><span className="max-w-[11rem] truncate">{r.tenant?.email ?? "—"}</span></p>
      <p className="flex items-center gap-1.5"><Phone className="size-3 shrink-0 text-slate-400" aria-hidden />{formatPhone(r.tenant?.phone)}</p>
    </div>
  );
}

/** Desktop/tablet: glass table. Phones: one card per tenant. */
export function TenantsTable({ rows, fetching, ...handlers }: Props) {
  const t = useTranslations("owner.tenants");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const item = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: reduce ? 0 : -16 }, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.03 } });
  const nameCell = (r: DirectoryRow) => (
    <div className="flex items-center gap-3">
      <Avatar name={r.tenant?.fullName ?? "?"} url={r.tenant?.avatarUrl} size="size-9" />
      <div className="min-w-0"><p className="max-w-[10rem] font-bold leading-tight text-navy">{r.tenant?.fullName ?? "—"}</p><span className="mt-1 inline-block rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t("member", { n: n(r.members) })}</span></div>
    </div>
  );
  const unitCell = (r: DirectoryRow) => (
    <div><p className="text-xs font-semibold text-slate-700">{r.property.name}</p><span className="mt-1 inline-block rounded bg-sky-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{t("unitLabel", { no: r.unit.unitNumber })}</span></div>
  );

  return (
    <div className={clsx("transition-opacity duration-300", fetching && "opacity-60")}>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">{t("metaTitle")}</caption>
          <thead className="bg-slate-100/60 text-xs uppercase tracking-wide text-navy">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">{t("cols.name")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.unit")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.lease")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.contact")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.status")}</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">{t("cols.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.tr key={r.id} layout={!reduce} {...item(i)} className="border-t border-slate-200/60 transition-colors duration-300 hover:bg-white/80">
                  <td className="px-4 py-3">{nameCell(r)}</td>
                  <td className="px-3 py-3">{unitCell(r)}</td>
                  <td className="px-3 py-3"><Lease r={r} /></td>
                  <td className="px-3 py-3"><Contact r={r} /></td>
                  <td className="px-3 py-3"><Status r={r} /></td>
                  <td className="px-4 py-3"><Actions r={r} {...handlers} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.li key={r.id} layout={!reduce} {...item(i)} className="rounded-xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">{nameCell(r)}<Status r={r} /></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{unitCell(r)}<Lease r={r} /></div>
              <div className="mt-3"><Contact r={r} /></div>
              <div className="mt-3 border-t border-slate-200/70 pt-3"><Actions r={r} {...handlers} /></div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
