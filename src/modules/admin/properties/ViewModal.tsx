"use client";

import { useState } from "react";
import { AlertTriangle, Check, ImageOff, MapPin, Phone, RefreshCw, Ruler, User, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatPhone } from "../../owner/tenants/format";
import { AMENITY_CODES } from "./amenities";
import { StateBadge } from "./PropertyTable";
import type { PropertyOverview, PropertyRow } from "./types";

const AVAILABILITY_STYLE: Record<string, string> = { OCCUPIED: "bg-emerald-100 text-emerald-700", AVAILABLE: "bg-sky-100 text-sky-700", MAINTENANCE: "bg-amber-100 text-amber-700" };

export function ViewModal({ row, onClose }: { row: PropertyRow | null; onClose: () => void }) {
  return (
    <Modal open={!!row} onClose={onClose} labelledBy="pv-title" maxWidth="max-w-[800px]">
      {row && <PropertyBody row={row} headingId="pv-title" />}
    </Modal>
  );
}

/**
 * Everything about one property (photos, owner, address, occupancy, units, amenities), loaded from the database.
 * "View Details" shows it alone; "Edit Property" shows the same details with its own title and a footer (the status choices).
 */
export function PropertyBody({ row, headingId, heading, footer }: { row: PropertyRow; headingId: string; heading?: string; footer?: React.ReactNode }) {
  const t = useTranslations("admin.properties.view");
  const tp = useTranslations("admin.properties");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const q = useAuthQuery<PropertyOverview>(`/admin/properties/${row.id}/overview`);
  const [shot, setShot] = useState(0);
  const d = q.data;
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const taka = (s: string) => `৳ ${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 0 }).format(Number(s))}`;

  return (
    <div>
      <header className="pr-10">
        <h2 id={headingId} className="text-xl font-bold text-navy sm:text-2xl">{heading ?? d?.name ?? row.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">{heading && <span className="font-semibold text-navy">{row.name}</span>}{tp(`types.${row.type}`)}<StateBadge state={d?.state ?? row.state} /></p>
      </header>

      {q.state === "loading" && !d && (
        <div aria-busy="true" className="mt-5 space-y-4"><span className="sr-only">{t("loading")}</span><div className="skeleton h-56 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-2"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div><div className="skeleton h-40 rounded-xl" /></div>
      )}
      {q.state === "error" && !d && (
        <div role="alert" className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {d && (
        <div className="mt-5 space-y-5">
          {/* photo gallery */}
          <section aria-label={t("gallery")}>
            {d.photos.length === 0 ? (
              <div className="grid h-44 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500"><span className="flex flex-col items-center gap-2 text-sm"><ImageOff className="size-7" aria-hidden />{t("noPhotos")}</span></div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl bg-slate-100"><motion.img key={d.photos[shot]!.id} src={d.photos[shot]!.url} alt={t("photoAlt", { n: shot + 1, name: d.name })} className="h-56 w-full object-cover sm:h-72" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.35 }} /></div>
                {d.photos.length > 1 && (
                  <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {d.photos.map((p, i) => (
                      <li key={p.id}><button type="button" onClick={() => setShot(i)} aria-label={t("showPhoto", { n: i + 1 })} aria-current={i === shot || undefined} className={clsx("block size-16 overflow-hidden rounded-lg border-2 transition-all duration-300", i === shot ? "border-[#0A84F0]" : "border-transparent opacity-70 hover:opacity-100")}><img src={p.url} alt="" className="size-full object-cover" /></button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* owner + place */}
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/70 bg-slate-50/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500"><User className="size-3.5" aria-hidden />{t("owner")}</dt>
              <dd className="mt-1 font-semibold text-navy">{d.owner.fullName}</dd>
              <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600"><Phone className="size-3.5" aria-hidden />{formatPhone(d.owner.phone)}</dd>
              {d.owner.ownerCode && <dd className="mt-0.5 text-xs text-slate-500">{d.owner.ownerCode}</dd>}
            </div>
            <div className="rounded-xl border border-white/70 bg-slate-50/80 p-3.5">
              <dt className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500"><MapPin className="size-3.5" aria-hidden />{t("address")}</dt>
              <dd className="mt-1 font-semibold text-navy">{d.location || "—"}</dd>
              <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600"><Ruler className="size-3.5" aria-hidden />{t("sqft")}: {d.sqft ? t("sqftValue", { n: num(d.sqft) }) : "—"} · {t("floors", { count: d.totalFloors })}</dd>
            </div>
          </dl>

          {/* occupancy */}
          <section aria-label={t("occupancy")} className="rounded-xl border border-white/70 bg-slate-50/80 p-3.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold text-navy">{t("occupancy")}</p>
              <p className="text-slate-600">{t("occupancyText", { occupied: num(d.occupancy.occupiedUnits), total: num(d.occupancy.totalUnits), rate: num(d.occupancy.rate) })}</p>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.occupancy.rate} aria-label={t("occupancy")} className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#48BDFA] to-[#9333EA]" initial={{ width: reduce ? `${d.occupancy.rate}%` : 0 }} animate={{ width: `${d.occupancy.rate}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
            </div>
          </section>

          {/* unit breakdown */}
          <section aria-label={t("units")}>
            <h3 className="mb-2 text-sm font-bold text-navy">{t("units")}</h3>
            {d.units.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t("noUnits")}</p> : (
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200/80" tabIndex={0} aria-label={t("unitsScroll")}>
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="sticky top-0 bg-white/95 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500"><tr>{(["unit", "floor", "beds", "area", "rent", "status"] as const).map((c) => <th key={c} scope="col" className="px-3 py-2">{t(`cols.${c}`)}</th>)}</tr></thead>
                  <tbody>
                    {d.units.map((u) => (
                      <tr key={u.id} className="border-t border-slate-200/70">
                        <td className="px-3 py-2 font-semibold text-navy">{u.unitNumber}</td><td className="px-3 py-2">{num(u.floor)}</td><td className="px-3 py-2">{num(u.bedrooms)}</td>
                        <td className="px-3 py-2">{u.areaSqft ? t("sqftValue", { n: num(u.areaSqft) }) : "—"}</td><td className="px-3 py-2">{taka(u.rent)}</td>
                        <td className="px-3 py-2"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", AVAILABILITY_STYLE[u.availability] ?? "bg-slate-200 text-slate-600")}>{t(`availability.${u.availability}`)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* amenities */}
          <section aria-label={t("amenities")}>
            <h3 className="mb-2 text-sm font-bold text-navy">{t("amenities")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {AMENITY_CODES.map((a) => {
                const has = d.amenities.includes(a);
                return (
                  <li key={a} className={clsx("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm", has ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-slate-200 bg-slate-50/70 text-slate-500")}>
                    <span aria-hidden className={clsx("grid size-5 place-items-center rounded-full", has ? "bg-emerald-500 text-white" : "bg-slate-300 text-white")}>{has ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                    {tp(`amenity.${a}`)}<span className="sr-only">{has ? t("yes") : t("no")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {footer}
    </div>
  );
}
