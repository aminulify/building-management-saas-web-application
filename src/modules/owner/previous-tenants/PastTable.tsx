"use client";

import { Pencil, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "../units/TenantPicker";
import { formatDate, formatPhone } from "../tenants/format";
import { BehaviorBadge } from "./BehaviorBadge";
import type { PastRow } from "./types";

interface Props { rows: PastRow[]; fetching: boolean; onOpen: (r: PastRow) => void; onEdit: (r: PastRow) => void; onRemove: (r: PastRow) => void }

function Actions({ r, onEdit, onRemove }: Pick<Props, "onEdit" | "onRemove"> & { r: PastRow }) {
  const t = useTranslations("owner.previousTenants.actions");
  const name = r.tenant?.fullName ?? "";
  const base = "grid size-9 place-items-center rounded-lg border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0";
  return (
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => onEdit(r)} aria-label={`${t("edit")}: ${name}`} title={t("edit")} className={clsx(base, "border-emerald-200 bg-emerald-100/80 text-emerald-600 hover:bg-emerald-200")}><Pencil className="size-4" aria-hidden /></button>
      <button type="button" onClick={() => onRemove(r)} aria-label={`${t("remove")}: ${name}`} title={t("remove")} className={clsx(base, "border-red-200 bg-red-100/80 text-red-600 hover:bg-red-200")}><Trash2 className="size-4" aria-hidden /></button>
    </div>
  );
}

/** Desktop and tablet: glass table, a click on a row opens the full history. Phones: one card per past tenant. */
export function PastTable({ rows, fetching, onOpen, onEdit, onRemove }: Props) {
  const t = useTranslations("owner.previousTenants");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const item = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: reduce ? 0 : -16 }, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.03 } });
  const reason = (r: PastRow) => (r.leaveReason ? t(`reason.${r.leaveReason}`) : "—");
  const lease = (r: PastRow) => `${formatDate(locale, r.startDate)} ${t("to")} ${formatDate(locale, r.endDate)}`;
  const person = (r: PastRow) => (
    <button type="button" onClick={() => onOpen(r)} aria-label={t("openHistory", { name: r.tenant?.fullName ?? "" })} className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#48BDFA]">
      <Avatar name={r.tenant?.fullName ?? "?"} url={r.tenant?.avatarUrl} size="size-10" />
      <span className="min-w-0"><span className="block max-w-[11rem] font-bold leading-tight text-navy">{r.tenant?.fullName ?? "—"}</span><span className="mt-0.5 block text-[11px] text-slate-500">{formatPhone(r.tenant?.phone)}</span></span>
    </button>
  );
  const place = (r: PastRow) => (<><p className="text-xs font-semibold text-slate-700">{r.property.name}</p><span className="mt-1 inline-block rounded bg-sky-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{t("unit", { no: r.unit.unitNumber })}</span></>);

  return (
    <div className={clsx("transition-opacity duration-300", fetching && "opacity-60")}>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">{t("metaTitle")}</caption>
          <thead className="bg-slate-100/60 text-xs uppercase tracking-wide text-navy">
            <tr>
              {(["tenant", "property", "lease", "reason", "behavior"] as const).map((k) => <th key={k} scope="col" className="px-4 py-3 font-bold">{t(`cols.${k}`)}</th>)}
              <th scope="col" className="px-4 py-3 text-right font-bold">{t("cols.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.tr key={r.id} layout={!reduce} {...item(i)} onClick={() => onOpen(r)} className="cursor-pointer border-t border-slate-200/60 transition-colors duration-300 hover:bg-white/90">
                  <td className="px-4 py-3">{person(r)}</td>
                  <td className="px-4 py-3">{place(r)}</td>
                  <td className="px-4 py-3 text-xs font-medium leading-snug text-navy">{lease(r)}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700">{reason(r)}</td>
                  <td className="px-4 py-3"><BehaviorBadge value={r.behavior} /></td>
                  <td className="px-4 py-3"><Actions r={r} onEdit={onEdit} onRemove={onRemove} /></td>
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
              <div className="flex items-start justify-between gap-3">{person(r)}<BehaviorBadge value={r.behavior} /></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{<div>{place(r)}</div>}<p className="text-xs font-medium text-navy">{lease(r)}</p></div>
              <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-700">{t("cols.reason")}:</span> {reason(r)}</p>
              <div className="mt-3 border-t border-slate-200/70 pt-3"><Actions r={r} onEdit={onEdit} onRemove={onRemove} /></div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
