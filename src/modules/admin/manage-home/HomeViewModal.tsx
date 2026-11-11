"use client";

import { useState } from "react";
import { AlertTriangle, Bath, BedDouble, Building, Check, ChevronLeft, ChevronRight, Flag, ImageOff, Layers, Mail, Phone, RefreshCw, Ruler, Sofa, User, Wind, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatPhone } from "../../owner/tenants/format";
import { areaText, day, initials, plain, taka } from "./format";
import { HomeBadge } from "./HomeTable";
import type { HomeOverview, HomeRow } from "./types";

const NEARBY = ["SCHOOL", "COLLEGE", "HOSPITAL", "PARK", "SECURITY"] as const;
const RENT_STYLE: Record<string, string> = { PAID: "bg-emerald-100 text-emerald-700", PARTIAL: "bg-amber-100 text-amber-700", DUE: "bg-sky-100 text-sky-700", OVERDUE: "bg-red-100 text-red-700" };

export function HomeViewModal({ row, onClose }: { row: HomeRow | null; onClose: () => void }) {
  return (
    <Modal open={!!row} onClose={onClose} labelledBy="hv-title" maxWidth="max-w-[850px]">
      {row && <HomeDetails row={row} headingId="hv-title" />}
    </Modal>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="size-12 shrink-0 rounded-full border-2 border-white object-cover shadow" />
    : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow">{initials(name)}</span>;
}

/**
 * Everything about one listing (photos, specs, owner, tenant, nearby places, open reports), loaded from the database.
 * "View Details" shows it alone; the Edit and Delete windows show the same details with their own title and a button section (`footer`).
 */
export function HomeDetails({ row, headingId, heading, footer }: { row: HomeRow; headingId: string; heading?: string; footer?: React.ReactNode }) {
  const t = useTranslations("admin.manageHome.view");
  const tm = useTranslations("admin.manageHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const q = useAuthQuery<HomeOverview>(`/admin/manage-home/${row.id}/overview`);
  const [shot, setShot] = useState(0);
  const d = q.data;
  const photos = d?.photos ?? [];
  const go = (n: number) => setShot((s) => (s + n + photos.length) % photos.length);
  const spec = (Icon: typeof Ruler, label: string, value: string | null) => (
    <div className="rounded-xl border border-white/70 bg-slate-50/80 p-3"><dt className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-slate-500"><Icon className="size-3.5" aria-hidden />{label}</dt><dd className="mt-1 font-semibold text-navy">{value ?? "—"}</dd></div>
  );

  return (
    <div>
      <header className="pr-10">
        <h2 id={headingId} className="text-xl font-bold text-navy sm:text-2xl">{heading ?? d?.title ?? row.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">{heading && <span className="font-semibold text-navy">{d?.title ?? row.title}</span>}<span>{d?.location ?? row.location}</span><HomeBadge state={d?.state ?? row.state} /></p>
      </header>

      {q.state === "loading" && !d && <div aria-busy="true" className="mt-5 space-y-4"><span className="sr-only">{t("loading")}</span><div className="skeleton h-64 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-3"><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /></div><div className="skeleton h-32 rounded-xl" /></div>}
      {q.state === "error" && !d && (
        <div role="alert" className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {d && (
        <div className="mt-5 space-y-5">
          {/* photo carousel */}
          <section aria-label={t("gallery")} aria-roledescription="carousel">
            {photos.length === 0 ? (
              <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500"><span className="flex flex-col items-center gap-2 text-sm"><ImageOff className="size-7" aria-hidden />{t("noPhotos")}</span></div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-2xl bg-slate-100">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.img key={photos[shot]!.id} src={photos[shot]!.url} alt={t("photoAlt", { n: shot + 1, title: d.title })} className="h-60 w-full object-cover sm:h-80" initial={{ opacity: 0, x: reduce ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.3 }} />
                  </AnimatePresence>
                  {photos.length > 1 && (
                    <>
                      <button type="button" onClick={() => go(-1)} aria-label={t("prev")} className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy shadow backdrop-blur transition-colors hover:bg-white"><ChevronLeft className="size-5" aria-hidden /></button>
                      <button type="button" onClick={() => go(1)} aria-label={t("next")} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy shadow backdrop-blur transition-colors hover:bg-white"><ChevronRight className="size-5" aria-hidden /></button>
                      <span className="absolute bottom-2 right-3 rounded-full bg-slate-900/60 px-2.5 py-0.5 text-xs font-semibold text-white">{shot + 1} / {photos.length}</span>
                    </>
                  )}
                </div>
                {photos.length > 1 && (
                  <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {photos.map((p, i) => <li key={p.id}><button type="button" onClick={() => setShot(i)} aria-label={t("showPhoto", { n: i + 1 })} aria-current={i === shot || undefined} className={clsx("block size-14 overflow-hidden rounded-lg border-2 transition-all duration-300", i === shot ? "border-[#0A84F0]" : "border-transparent opacity-70 hover:opacity-100")}><img src={p.url} alt="" className="size-full object-cover" /></button></li>)}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* price + specs */}
          <section aria-label={t("specs")}>
            <p className="mb-2 text-lg font-extrabold text-navy">{d.type === "RENT" ? tm("perMonth", { price: taka(locale, d.price) }) : taka(locale, d.price)}{d.negotiable && <span className="ml-2 text-xs font-semibold text-slate-500">{t("negotiable")}</span>}</p>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {spec(Ruler, t("sqft"), d.specs.area ? areaText(locale, d.specs.area, d.specs.areaUnit, tm("sqft")) : null)}
              {spec(BedDouble, t("bedrooms"), d.specs.bedrooms === null ? null : plain(locale, d.specs.bedrooms))}
              {spec(Bath, t("bathrooms"), d.specs.bathrooms === null ? null : plain(locale, d.specs.bathrooms))}
              {spec(Wind, t("balcony"), d.specs.balconies === null ? null : plain(locale, d.specs.balconies))}
              {spec(Layers, t("floor"), d.specs.floor === null ? null : d.specs.totalFloors ? t("floorOf", { floor: plain(locale, d.specs.floor), total: plain(locale, d.specs.totalFloors) }) : plain(locale, d.specs.floor))}
              {spec(Sofa, t("furnishing"), d.furnishing ? t(`furnishings.${d.furnishing}`) : null)}
            </dl>
            {d.description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{d.description}</p>}
          </section>

          {/* owner + tenant */}
          <div className="grid gap-3 sm:grid-cols-2">
            <section aria-label={t("owner")} className="rounded-xl border border-white/70 bg-slate-50/80 p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500"><User className="size-3.5" aria-hidden />{t("owner")}</h3>
              <div className="flex items-center gap-3">
                <Avatar name={d.owner.fullName} url={d.owner.avatarUrl} />
                <div className="min-w-0"><p className="truncate font-semibold text-navy">{d.owner.fullName}</p><p className="text-xs font-semibold text-[#0A84F0]">{t("ownerId")}: {d.owner.ownerCode ?? "—"}</p><p className="flex items-center gap-1 text-xs text-slate-600"><Phone className="size-3" aria-hidden />{formatPhone(d.owner.phone)}</p><p className="flex items-center gap-1 break-all text-xs text-slate-600"><Mail className="size-3 shrink-0" aria-hidden />{d.owner.email ?? "—"}</p></div>
              </div>
            </section>
            {d.occupied && (
              <section aria-label={t("tenant")} className="rounded-xl border border-white/70 bg-slate-50/80 p-3.5">
                <h3 className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500"><Building className="size-3.5" aria-hidden />{t("tenant")}</h3>
                {d.tenancy ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={d.tenancy.tenant.fullName} url={d.tenancy.tenant.avatarUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy">{d.tenancy.tenant.fullName}</p>
                      <p className="text-xs font-semibold text-[#0A84F0]">{t("tenantId")}: {d.tenancy.tenant.tenantCode ?? "—"}</p>
                      <p className="text-xs text-slate-600">{t("checkIn")}: {day(locale, d.tenancy.checkIn)}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{t("rentStatus")}: <span className={clsx("rounded-full px-2 py-0.5 text-[0.68rem] font-bold", d.tenancy.rentStatus ? RENT_STYLE[d.tenancy.rentStatus] : "bg-slate-200 text-slate-600")}>{d.tenancy.rentStatus ? t(`rent.${d.tenancy.rentStatus}`) : t("rent.NONE")}</span></p>
                    </div>
                  </div>
                ) : <p className="text-sm text-slate-600">{t("occupiedNoTenant")}</p>}
              </section>
            )}
          </div>

          {/* nearby places */}
          <section aria-label={t("nearby")}>
            <h3 className="mb-2 text-sm font-bold text-navy">{t("nearby")}</h3>
            <ul className="grid gap-2 sm:grid-cols-3">
              {NEARBY.map((n) => {
                const has = d.nearby[n];
                return (
                  <li key={n} className={clsx("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm", has ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-slate-200 bg-slate-50/70 text-slate-500")}>
                    <span aria-hidden className={clsx("grid size-5 place-items-center rounded-full text-white", has ? "bg-emerald-500" : "bg-slate-300")}>{has ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                    {t(`places.${n}`)}<span className="sr-only">{has ? t("yes") : t("no")}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {d.reports.length > 0 && (
            <section aria-label={t("reports")} className="rounded-xl border border-red-200 bg-red-50/70 p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-red-700"><Flag className="size-4" aria-hidden />{t("reports")}</h3>
              <ul className="space-y-1.5 text-sm text-red-900">{d.reports.map((r) => <li key={r.id}><span className="font-semibold">{r.category}</span>{r.description ? `: ${r.description}` : ""}</li>)}</ul>
            </section>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}
