"use client";

import { Bath, BedDouble, Heart, ImageOff, MapPin, Ruler, Share2, Sparkles, Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, formatTaka, timeAgo } from "../owner/dashboard/format";
import type { HomeCardData } from "./types";

interface Props {
  home: HomeCardData;
  index: number;
  onOpen: (id: string) => void;
  onToggleSave: (home: HomeCardData) => void;
  onShare: (home: HomeCardData) => void;
  /** Marketplace shows what kind of home it is (flat, land…) on the photo */
  showCategory?: boolean;
}

export function PropertyCard({ home: h, index, onOpen, onToggleSave, onShare, showCategory = false }: Props) {
  const cat = useTranslations("owner.findHome.category");
  const t = useTranslations("owner.findHome.card");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const taka = formatTaka(locale);
  const icon = "inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-600";

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }} transition={{ duration: 0.45, delay: reduce ? 0 : Math.min(index % 9, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {h.coverUrl
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sizes vary
          ? <img src={h.coverUrl} alt={h.title} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
          : <div className="grid size-full place-items-center text-slate-300"><ImageOff className="size-10" aria-label={t("noPhoto")} /></div>}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-900/35 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-white/85 px-2.5 py-1 text-[0.7rem] font-bold text-navy backdrop-blur">{timeAgo(locale, h.createdAt)}</span>
          {h.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[0.7rem] font-bold text-white shadow-sm"><Star className="size-3 fill-current" aria-hidden />{t("featured")}</span>}
        </div>
        {h.isOwn && <span className="absolute left-3 top-11 rounded-full bg-navy/80 px-2.5 py-1 text-[0.7rem] font-bold text-white backdrop-blur">{t("yours")}</span>}
        {h.matchPercent !== undefined && <span className="absolute left-3 top-11 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-1 text-[0.7rem] font-bold text-white"><Sparkles className="size-3" aria-hidden />{t("match", { n: n(h.matchPercent) })}</span>}
        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" onClick={() => onShare(h)} aria-label={t("share")} className="grid size-9 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:text-[#0A84F0] active:scale-95">
            <Share2 className="size-[1.05rem]" aria-hidden />
          </button>
          <button type="button" onClick={() => onToggleSave(h)} aria-pressed={h.isFavorite} aria-label={h.isFavorite ? t("unsave") : t("save")} className={clsx("grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 active:scale-95", h.isFavorite ? "text-pink-500" : "text-slate-600 hover:text-pink-500")}>
            <Heart className={clsx("size-[1.05rem] transition-transform duration-300", h.isFavorite && "scale-110 fill-current")} aria-hidden />
          </button>
        </div>
        {showCategory && <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[0.7rem] font-bold text-navy backdrop-blur">{cat(h.category)}</span>}
        {h.photos > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/60 px-2 py-0.5 text-[0.68rem] font-semibold text-white backdrop-blur">{t("photos", { n: n(h.photos) })}</span>}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="truncate text-[1.02rem] font-bold text-navy" title={h.title}>{h.title}</h3>
        <p className="flex items-center gap-1.5 text-[0.82rem] text-slate-600"><MapPin className="size-4 shrink-0 text-pink-500" aria-hidden /><span className="truncate">{h.locationLabel || t("noLocation")}</span></p>
        <div className="flex flex-wrap gap-2">
          {h.bedrooms !== null && <span className={icon}><BedDouble className="size-3.5" aria-hidden />{t("beds", { n: h.bedrooms })}</span>}
          {h.bathrooms !== null && <span className={icon}><Bath className="size-3.5" aria-hidden />{t("baths", { n: h.bathrooms })}</span>}
          {h.area !== null && <span className={icon}><Ruler className="size-3.5" aria-hidden />{t("areaChip", { n: n(Number(h.area)), unit: t(`unit.${h.areaUnit ?? "SQFT"}`) })}</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-label">{h.type === "RENT" ? t("perMonth") : t("salePrice")}</p>
            <p className="truncate text-xl font-extrabold text-[#0A84F0]">{taka(Number(h.price))}</p>
          </div>
          <button type="button" onClick={() => onOpen(h.id)} className="btn btn-primary h-10 shrink-0 px-4 text-sm">{t("viewDetails")}</button>
        </div>
      </div>
    </motion.article>
  );
}
