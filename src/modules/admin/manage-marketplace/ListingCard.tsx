"use client";

import { Bath, BedDouble, Eye, ImageOff, Loader2, Mail, MapPin, Pencil, Phone, Ruler, Star, Tag, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { ago, areaText, initials, plain, taka } from "../manage-home/format";
import { HomeBadge } from "../manage-home/HomeTable";
import type { HomeRow } from "../manage-home/types";

interface Props {
  row: HomeRow; index: number; busyFeature: boolean;
  onView: (r: HomeRow) => void; onEdit: (r: HomeRow) => void; onDelete: (r: HomeRow) => void; onFeature: (r: HomeRow) => void;
}

/** A glass card per buy / sell listing: photo with price, owner contact, and the four moderation actions. */
export function ListingCard({ row: r, index, busyFeature, onView, onEdit, onDelete, onFeature }: Props) {
  const t = useTranslations("admin.manageMarket.card");
  const tc = useTranslations("admin.manageMarket.categories");
  const tm = useTranslations("admin.manageHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const chip = "inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-600";
  const act = "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-2 text-xs font-bold text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:hover:translate-y-0";
  const canFeature = r.status === "PUBLISHED" && r.openReports === 0;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : Math.min(index % 6, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(15,23,42,0.32)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {r.thumbnailUrl
          ? <img src={r.thumbnailUrl} alt={t("photoAlt", { title: r.title })} loading="lazy" decoding="async" className={clsx("absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none", r.sold && "grayscale-[0.6]")} />
          : <div className="grid size-full place-items-center text-slate-300"><ImageOff className="size-10" aria-label={t("noPhoto")} /></div>}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-900/35 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900/55 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/90 p-0.5 shadow-sm backdrop-blur"><HomeBadge state={r.state} /></span>
          <span className={clsx("rounded-full px-2.5 py-1 text-[0.68rem] font-bold text-white shadow-sm", r.sold ? "bg-slate-600" : "bg-emerald-500")}>{tm(r.sold ? "sale.sold" : "sale.forSale")}</span>
        </div>
        <button type="button" onClick={() => onFeature(r)} disabled={busyFeature || (!r.isFeatured && !canFeature)} aria-pressed={r.isFeatured} aria-label={t(r.isFeatured ? "unfeatureAria" : "featureAria", { title: r.title })} title={!r.isFeatured && !canFeature ? t("notLive") : t(r.isFeatured ? "unfeature" : "feature")}
          className={clsx("absolute right-3 top-3 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60", r.isFeatured ? "bg-amber-400 text-white" : "bg-white/90 text-slate-500 hover:text-amber-500")}>
          {busyFeature ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Star className={clsx("size-[1.05rem]", r.isFeatured && "fill-current")} aria-hidden />}
        </button>

        <span className="absolute bottom-3 left-3 rounded-xl bg-brand-gradient px-3 py-1.5 text-base font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.7)]">
          {taka(locale, r.price)}{r.negotiable && <span className="ml-1.5 text-xs font-semibold opacity-90">{t("negotiable")}</span>}
        </span>
        {r.isFeatured && <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[0.68rem] font-bold text-white shadow-sm"><Star className="size-3 fill-current" aria-hidden />{t("featuredBadge")}</span>}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate text-[1.02rem] font-bold text-navy" title={r.title}>{r.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-[0.82rem] text-slate-600"><MapPin className="size-4 shrink-0 text-pink-500" aria-hidden /><span className="truncate">{r.location || "—"}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={chip}><Tag className="size-3.5" aria-hidden />{tc(r.category)}</span>
          {r.bedrooms !== null && <span className={chip}><BedDouble className="size-3.5" aria-hidden />{plain(locale, r.bedrooms)}</span>}
          {r.bathrooms !== null && <span className={chip}><Bath className="size-3.5" aria-hidden />{plain(locale, r.bathrooms)}</span>}
          {r.area && <span className={chip}><Ruler className="size-3.5" aria-hidden />{areaText(locale, r.area, r.areaUnit, tm("sqft"))}</span>}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-white/70 bg-slate-50/80 p-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">{initials(r.owner.fullName)}</span>
          <div className="min-w-0 text-xs text-slate-600">
            <p className="truncate text-sm font-semibold text-navy">{r.owner.fullName}{r.owner.ownerCode && <span className="ml-1.5 text-[0.68rem] font-bold text-[#0A84F0]">{r.owner.ownerCode}</span>}</p>
            <p className="mt-0.5 flex items-center gap-1.5"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{tm("phone")}: </span>{formatPhone(r.owner.phone)}</p>
            <p className="flex items-center gap-1.5 break-all"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{tm("email")}: </span>{r.owner.email ?? "—"}</p>
          </div>
        </div>

        <p className="flex items-center justify-between text-xs text-slate-500">
          <span>{t("posted", { when: ago(locale, r.createdAt, tm("justNow")) })}</span>
          {r.openReports > 0 && <span className="font-semibold text-red-600">{tm("openReports", { count: r.openReports })}</span>}
        </p>

        <div className="mt-auto grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onView(r)} aria-label={tm("viewAria", { title: r.title })} className={clsx(act, "hover:border-[#48BDFA] hover:text-[#0A84F0]")}><Eye className="size-4" aria-hidden />{t("view")}</button>
          <button type="button" onClick={() => onEdit(r)} aria-label={tm("editAria", { title: r.title })} className={clsx(act, "hover:border-[#9333EA] hover:text-[#9333EA]")}><Pencil className="size-4" aria-hidden />{t("edit")}</button>
          <button type="button" onClick={() => onDelete(r)} aria-label={tm("deleteAria", { title: r.title })} className={clsx(act, "hover:border-red-400 hover:text-red-600")}><Trash2 className="size-4" aria-hidden />{t("delete")}</button>
        </div>
      </div>
    </motion.article>
  );
}
