"use client";

import { Pencil, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { formatNumber, formatTaka } from "../dashboard/format";
import { statusTone } from "./schema";
import { Avatar } from "./TenantPicker";
import type { UnitRow } from "./types";

interface Props { rows: UnitRow[]; fetching: boolean; onEdit: (u: UnitRow) => void; onDelete: (u: UnitRow) => void }

function useRoomSummary() {
  const t = useTranslations("owner.units.rooms");
  const n = formatNumber(useLocale());
  return (u: UnitRow) =>
    [u.bedrooms > 0 && t("bed", { n: n(u.bedrooms) }), u.bathrooms > 0 && t("bath", { n: n(u.bathrooms) }), u.diningRooms > 0 && t("dining", { n: n(u.diningRooms) }), u.kitchens > 0 && t("kitchen", { n: n(u.kitchens) })].filter(Boolean).join(", ");
}

function Actions({ u, onEdit, onDelete }: { u: UnitRow; onEdit: Props["onEdit"]; onDelete: Props["onDelete"] }) {
  const t = useTranslations("owner.units.actions");
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => onEdit(u)} aria-label={`${t("edit")}: ${u.unitNumber}, ${u.property.name}`} title={t("edit")} className="grid size-9 place-items-center rounded-lg border border-emerald-200 bg-emerald-100/80 text-emerald-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-200 hover:shadow-md motion-reduce:hover:translate-y-0"><Pencil className="size-4" aria-hidden /></button>
      <button type="button" onClick={() => onDelete(u)} aria-label={`${t("delete")}: ${u.unitNumber}, ${u.property.name}`} title={t("delete")} className="grid size-9 place-items-center rounded-lg border border-red-200 bg-red-100/80 text-red-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-200 hover:shadow-md motion-reduce:hover:translate-y-0"><Trash2 className="size-4" aria-hidden /></button>
    </div>
  );
}

function Status({ u }: { u: UnitRow }) {
  const t = useTranslations("owner.units.status");
  return <StatusBadge tone={statusTone[u.status]} dot>{t(u.status)}</StatusBadge>;
}

/** Desktop/tablet: glass table. Phones: one card per unit. */
export function UnitsTable({ rows, fetching, onEdit, onDelete }: Props) {
  const t = useTranslations("owner.units");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const rooms = useRoomSummary();
  const item = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: reduce ? 0 : -16 }, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.03 } });
  const tenantCell = (u: UnitRow) =>
    u.tenant ? (
      <div className="flex items-center gap-2"><Avatar name={u.tenant.fullName} url={u.tenant.avatarUrl} size="size-7" /><span className="max-w-[9rem] text-xs font-medium leading-tight text-navy">{u.tenant.fullName}</span></div>
    ) : <span className="text-xs text-slate-500">{t("noTenant")}</span>;

  return (
    <div className={clsx("transition-opacity duration-300", fetching && "opacity-60")}>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <caption className="sr-only">{t("metaTitle")}</caption>
          <thead className="bg-slate-100/60 text-xs uppercase tracking-wide text-navy">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">{t("cols.name")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.property")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.tenant")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.sqft")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.rent")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.status")}</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">{t("cols.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((u, i) => (
                <motion.tr key={u.id} layout={!reduce} {...item(i)} className="border-t border-slate-200/60 transition-colors duration-300 hover:bg-white/80">
                  <td className="px-4 py-3"><p className="font-bold text-navy">{u.unitNumber}</p><p className="mt-0.5 max-w-[11rem] text-[11px] leading-tight text-slate-500">{rooms(u)}</p></td>
                  <td className="px-3 py-3"><p className="font-bold leading-tight text-navy">{u.property.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{u.property.locationLabel}</p></td>
                  <td className="px-3 py-3">{tenantCell(u)}</td>
                  <td className="px-3 py-3 tabular-nums"><span className="font-bold text-navy">{u.areaSqft ? n(u.areaSqft) : "—"}</span><span className="block text-[10px] text-slate-500">{t("sqftUnit")}</span></td>
                  <td className="px-3 py-3 tabular-nums"><span className="font-bold text-navy">{taka(Number(u.rent))}</span><span className="block text-[10px] text-slate-500">{t("perMonth")}</span></td>
                  <td className="px-3 py-3"><Status u={u} /></td>
                  <td className="px-4 py-3"><Actions u={u} onEdit={onEdit} onDelete={onDelete} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        <AnimatePresence initial={false}>
          {rows.map((u, i) => (
            <motion.li key={u.id} layout={!reduce} {...item(i)} className="rounded-xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1"><p className="font-bold text-navy">{u.unitNumber} <span className="font-medium text-slate-500">· {u.property.name}</span></p><p className="mt-0.5 text-xs text-slate-500">{rooms(u)}</p></div>
                <Status u={u} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">{tenantCell(u)}<div className="text-right text-sm"><p className="font-bold tabular-nums text-navy">{taka(Number(u.rent))}<span className="text-[10px] font-normal text-slate-500"> {t("perMonth")}</span></p><p className="text-xs text-slate-500">{u.areaSqft ? `${n(u.areaSqft)} ${t("sqftUnit")}` : "—"}</p></div></div>
              <div className="mt-3 border-t border-slate-200/70 pt-3"><Actions u={u} onEdit={onEdit} onDelete={onDelete} /></div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
