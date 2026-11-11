"use client";

import { AlertTriangle, Building2, Layers, MapPin, RefreshCw, UserPlus, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { CountUp } from "@/components/motion/CountUp";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber } from "../dashboard/format";
import { donut } from "./logic";
import type { OverviewProperty } from "./types";

interface Detail { id: string; name: string; type: string; totalFloors: number; description: string | null; locationText: string | null; address: { division: string; district: string; upazila: string | null; area: string | null } | null }
interface Props { property: OverviewProperty | null; onClose: () => void }

/** Property deep dive: where it is, how many floors, and a donut of total / occupied / vacant units with shortcuts. */
export function PropertyModal({ property, onClose }: Props) {
  return (
    <Modal open={property !== null} onClose={onClose} labelledBy="prop-title" maxWidth="max-w-[600px]">
      {property && <Body p={property} onClose={onClose} />}
    </Modal>
  );
}

function Body({ p, onClose }: { p: OverviewProperty; onClose: () => void }) {
  const t = useTranslations("owner.profile.property");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const q = useAuthQuery<Detail>(`/properties/${p.id}`);
  const d = donut(p.units, p.occupied);
  const R = 52, C = 2 * Math.PI * R;
  const d0 = q.data;
  const place = d0 ? [d0.address?.area, d0.address?.upazila, d0.address?.district, d0.address?.division].filter(Boolean).join(", ") : "";

  return (
    <div>
      <header className="flex items-center gap-3 pr-10">
        {p.coverUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.coverUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600"><Building2 className="size-7" /></span>}
        <div className="min-w-0"><h2 id="prop-title" className="truncate text-xl font-bold text-navy sm:text-2xl">{p.name}</h2><p className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="size-3 shrink-0" aria-hidden /><span className="truncate">{p.locationLabel || "—"}</span></p></div>
      </header>

      <div className="mt-5 grid items-center gap-5 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-md sm:grid-cols-[auto_1fr]">
        <div className="relative mx-auto size-36" role="img" aria-label={t("donutAria", { occupied: n(d.occupied), total: n(p.units) })}>
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#e2e8f0" strokeWidth="12" />
            <motion.circle cx="60" cy="60" r={R} fill="none" stroke="url(#donut-g)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C}
              initial={{ strokeDashoffset: reduce ? C * (1 - d.frac) : C }} animate={{ strokeDashoffset: C * (1 - d.frac) }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
            <defs><linearGradient id="donut-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#F413E6" /><stop offset="100%" stopColor="#48BDFA" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-2xl font-extrabold text-navy"><CountUp value={d.percent} format={(v) => `${n(v)}%`} /></p><p className="text-[10px] font-bold uppercase tracking-wider text-label">{t("occupied")}</p></div></div>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-1 sm:text-left">
          {[{ k: "total", v: p.units, c: "bg-slate-100 text-navy" }, { k: "occupied", v: d.occupied, c: "bg-sky-100 text-sky-700" }, { k: "vacant", v: d.vacant, c: "bg-emerald-100 text-emerald-700" }].map((x) => (
            <div key={x.k} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${x.c}`}><dt className="text-[11px] font-bold uppercase tracking-wide">{t(x.k as never)}</dt><dd className="text-lg font-extrabold"><CountUp value={x.v} format={n} /></dd></div>
          ))}
        </dl>
      </div>

      <section className="mt-4 rounded-xl border border-white/70 bg-white/60 p-4 text-sm backdrop-blur-md" aria-busy={q.state === "loading" || undefined}>
        {q.state === "loading" && <div className="space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-4 w-1/2" /></div>}
        {q.state === "error" && <p role="alert" className="flex items-center gap-2 text-red-700"><AlertTriangle className="size-4" aria-hidden />{t("error")} <button type="button" onClick={q.reload} className="font-bold underline"><RefreshCw className="inline size-3" aria-hidden /> {t("retry")}</button></p>}
        {d0 && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("type")}</dt><dd className="font-semibold text-navy"><span className="capitalize">{d0.type.replace(/_/g, " ").toLowerCase()}</span></dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("floors")}</dt><dd className="flex items-center gap-1.5 font-semibold text-navy"><Layers className="size-4 text-slate-400" aria-hidden />{n(d0.totalFloors)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("address")}</dt><dd className="font-semibold text-navy">{d0.locationText || place || "—"}</dd></div>
            {d0.description && <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-label">{t("about")}</dt><dd className="text-slate-700">{d0.description}</dd></div>}
          </dl>
        )}
      </section>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        <Link href={"/home-owner/tenants" as never} onClick={onClose} className="btn btn-primary h-11 text-sm"><UserPlus className="size-4" aria-hidden />{t("assign")}</Link>
        <Link href={"/home-owner/units" as never} onClick={onClose} className="btn btn-white h-11 text-sm"><Users className="size-4" aria-hidden />{t("units")}</Link>
        <Link href={"/home-owner/properties" as never} onClick={onClose} className="btn btn-white h-11 text-sm"><Building2 className="size-4" aria-hidden />{t("manage")}</Link>
      </div>
    </div>
  );
}
