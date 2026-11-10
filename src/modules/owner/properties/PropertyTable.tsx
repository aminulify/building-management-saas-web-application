"use client";

import { Building2, Pencil, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "../dashboard/format";
import type { PropertyRow } from "./types";

interface Props { rows: PropertyRow[]; onEdit: (p: PropertyRow) => void; onDelete: (p: PropertyRow) => void }

function Thumb({ url, name }: { url: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover shadow-sm" />;
  return <span aria-hidden title={name} className="grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-200 to-fuchsia-200 text-sky-700"><Building2 className="size-5" /></span>;
}

function Actions({ p, onEdit, onDelete, label }: { p: PropertyRow; onEdit: Props["onEdit"]; onDelete: Props["onDelete"]; label: (k: "edit" | "delete") => string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => onEdit(p)} aria-label={`${label("edit")}: ${p.name}`} title={label("edit")} className="grid size-9 place-items-center rounded-lg border border-emerald-200 bg-emerald-100/80 text-emerald-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-200 hover:shadow-md motion-reduce:hover:translate-y-0"><Pencil className="size-4" aria-hidden /></button>
      <button type="button" onClick={() => onDelete(p)} aria-label={`${label("delete")}: ${p.name}`} title={label("delete")} className="grid size-9 place-items-center rounded-lg border border-red-200 bg-red-100/80 text-red-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-200 hover:shadow-md motion-reduce:hover:translate-y-0"><Trash2 className="size-4" aria-hidden /></button>
    </div>
  );
}

/** Desktop/tablet: glass table. Phones: one card per property. */
export function PropertyTable({ rows, onEdit, onDelete }: Props) {
  const t = useTranslations("owner.properties");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const label = (k: "edit" | "delete") => t(`actions.${k}`);
  const item = (i: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: reduce ? 0 : -16 }, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.04 } });

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-md md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">{t("metaTitle")}</caption>
          <thead className="bg-slate-100/60 text-xs uppercase tracking-wide text-navy">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">{t("cols.name")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.location")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.sqft")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.units")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.occupied")}</th>
              <th scope="col" className="px-3 py-3 font-bold">{t("cols.vacant")}</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">{t("cols.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial>
              {rows.map((p, i) => (
                <motion.tr key={p.id} layout={!reduce} {...item(i)} className="border-t border-slate-200/60 transition-colors duration-300 hover:bg-white/80">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Thumb url={p.coverUrl} name={p.name} /><span className="max-w-[11rem] font-bold leading-tight text-navy">{p.name}</span></div></td>
                  <td className="max-w-[13rem] px-3 py-3 text-slate-600">{p.locationLabel || "—"}</td>
                  <td className="px-3 py-3 font-bold tabular-nums text-navy">{n(p.sqft)}</td>
                  <td className="px-3 py-3 tabular-nums text-navy">{n(p.totalUnits)}</td>
                  <td className="px-3 py-3 tabular-nums"><span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 font-semibold text-sky-700">{n(p.occupiedUnits)}</span></td>
                  <td className="px-3 py-3 tabular-nums"><span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 font-semibold text-amber-700">{n(p.vacantUnits)}</span></td>
                  <td className="px-4 py-3"><Actions p={p} onEdit={onEdit} onDelete={onDelete} label={label} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        <AnimatePresence initial>
          {rows.map((p, i) => (
            <motion.li key={p.id} layout={!reduce} {...item(i)} className="rounded-xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md">
              <div className="flex items-start gap-3">
                <Thumb url={p.coverUrl} name={p.name} />
                <div className="min-w-0 flex-1"><p className="font-bold leading-tight text-navy">{p.name}</p><p className="mt-0.5 text-xs text-slate-600">{p.locationLabel || "—"}</p></div>
                <Actions p={p} onEdit={onEdit} onDelete={onDelete} label={label} />
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                {([["sqft", p.sqft], ["units", p.totalUnits], ["occupied", p.occupiedUnits], ["vacant", p.vacantUnits]] as const).map(([k, val]) => (
                  <div key={k} className="rounded-lg bg-slate-100/60 px-1 py-2"><dt className="text-[10px] uppercase tracking-wide text-label">{t(`cols.${k}`)}</dt><dd className="mt-0.5 font-bold tabular-nums text-navy">{n(val)}</dd></div>
                ))}
              </dl>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}
