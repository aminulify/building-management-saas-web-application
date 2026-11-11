"use client";

import { useState } from "react";
import { Bath, BedDouble, ChevronLeft, ChevronRight, Eye, Heart, ImageOff, MapPin, MessageCircle, Ruler, Share2, ShieldCheck, Star, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, timeAgo } from "../owner/dashboard/format";
import type { HomeCardData } from "../find-home/types";
import { priceBadge } from "./price";

interface Props {
  home: HomeCardData;
  index: number;
  onOpen: (id: string) => void;
  onContact: (home: HomeCardData) => void;
  onToggleSave: (home: HomeCardData) => void;
  onShare: (home: HomeCardData) => void;
}

const CONDITION_TONE: Record<string, string> = { NEW: "bg-emerald-500", LIKE_NEW: "bg-teal-500", GOOD: "bg-sky-500", FAIR: "bg-amber-500" };

/** Glass property card: photo carousel, price tag, condition, owner with NID badge, View Details and Contact Owner. */
export function MarketCard({ home: h, index, onOpen, onContact, onToggleSave, onShare }: Props) {
  const t = useTranslations("owner.marketplace.card");
  const f = useTranslations("owner.findHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const [i, setI] = useState(0);
  const photos = h.gallery?.length ? h.gallery : h.coverUrl ? [h.coverUrl] : [];
  const price = priceBadge(locale, Number(h.price), h.type);
  const go = (to: number) => setI((to + photos.length) % photos.length);
  const chip = "inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-600";
  const land = h.category === "LAND";
  const s = h.seller;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.45, delay: reduce ? 0 : Math.min(index % 6, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {photos.length ? photos.map((src, k) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sizes vary
          <img key={src} src={src} alt={k === i ? h.title : ""} loading={k === 0 ? "eager" : "lazy"} decoding="async" aria-hidden={k !== i}
            className={clsx("absolute inset-0 size-full object-cover transition-opacity duration-500 motion-reduce:transition-none", k === i ? "opacity-100" : "opacity-0")} />
        )) : <div className="grid size-full place-items-center text-slate-300"><ImageOff className="size-10" aria-label={f("card.noPhoto")} /></div>}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-900/35 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900/55 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {h.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[0.68rem] font-bold text-white shadow-sm"><Star className="size-3 fill-current" aria-hidden />{f("card.featured")}</span>}
          {h.condition && f.has(`details.conditions.${h.condition}`) && <span className={clsx("rounded-full px-2.5 py-1 text-[0.68rem] font-bold text-white shadow-sm", CONDITION_TONE[h.condition] ?? "bg-slate-500")}>{f(`details.conditions.${h.condition}`)}</span>}
          {h.isOwn && <span className="rounded-full bg-navy/80 px-2.5 py-1 text-[0.68rem] font-bold text-white backdrop-blur">{f("card.yours")}</span>}
        </div>
        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" onClick={() => onShare(h)} aria-label={f("card.share")} className="grid size-9 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:text-[#0A84F0] active:scale-95"><Share2 className="size-[1.05rem]" aria-hidden /></button>
          <button type="button" onClick={() => onToggleSave(h)} aria-pressed={h.isFavorite} aria-label={h.isFavorite ? f("card.unsave") : f("card.save")} className={clsx("grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 active:scale-95", h.isFavorite ? "text-pink-500" : "text-slate-600 hover:text-pink-500")}>
            <Heart className={clsx("size-[1.05rem] transition-transform duration-300", h.isFavorite && "scale-110 fill-current")} aria-hidden />
          </button>
        </div>

        <span className="absolute bottom-3 left-3 rounded-xl bg-brand-gradient px-3 py-1.5 text-base font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.7)]">
          {price.text}<span className="text-xs font-semibold opacity-90">{price.suffix}</span>
        </span>
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(i - 1)} aria-label={f("details.prev")} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy opacity-0 shadow backdrop-blur transition-opacity duration-300 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></button>
            <button type="button" onClick={() => go(i + 1)} aria-label={f("details.next")} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy opacity-0 shadow backdrop-blur transition-opacity duration-300 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></button>
            <div className="absolute bottom-3 right-3 flex gap-1" aria-hidden>{photos.map((p, k) => <span key={p} className={clsx("h-1.5 rounded-full bg-white transition-all duration-300", k === i ? "w-4" : "w-1.5 opacity-60")} />)}</div>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="truncate text-[1.02rem] font-bold text-navy" title={h.title}>{h.title}</h3>
        <p className="flex items-center gap-1.5 text-[0.82rem] text-slate-600"><MapPin className="size-4 shrink-0 text-pink-500" aria-hidden /><span className="truncate">{h.locationLabel || f("card.noLocation")}</span></p>
        <div className="flex flex-wrap gap-2">
          {!land && h.bedrooms !== null && <span className={chip}><BedDouble className="size-3.5" aria-hidden />{f("card.beds", { n: h.bedrooms })}</span>}
          {!land && h.bathrooms !== null && <span className={chip}><Bath className="size-3.5" aria-hidden />{f("card.baths", { n: h.bathrooms })}</span>}
          {h.area !== null && <span className={chip}><Ruler className="size-3.5" aria-hidden />{f("card.areaChip", { n: n(Number(h.area)), unit: f(`card.unit.${h.areaUnit ?? "SQFT"}`) })}</span>}
          <span className={chip}>{f(`category.${h.category}`)}</span>
        </div>

        {s && (
          <div className="mt-1 flex items-center gap-2.5 border-t border-slate-100 pt-3">
            {s.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              ? <img src={s.avatarUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-white" />
              : <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand-gradient text-white"><UserRound className="size-4" /></span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy">{s.fullName}</p>
              <p className={clsx("flex items-center gap-1 text-[0.66rem] font-extrabold uppercase tracking-wide", s.verified ? "text-emerald-600" : "text-slate-400")}>
                {s.verified ? <><ShieldCheck className="size-3" aria-hidden />● {t("verifiedNid")}</> : t("notVerified")}
              </p>
            </div>
            <span className="shrink-0 text-[0.68rem] font-semibold text-label">{timeAgo(locale, h.createdAt)}</span>
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={() => onOpen(h.id)} className="btn btn-primary h-10 gap-1.5 whitespace-nowrap px-2 text-[0.8rem]"><Eye className="size-4 shrink-0" aria-hidden />{t("viewDetails")}</button>
          <button type="button" onClick={() => onContact(h)} disabled={h.isOwn} className="btn btn-white h-10 gap-1.5 whitespace-nowrap px-2 text-[0.8rem]"><MessageCircle className="size-4 shrink-0" aria-hidden />{t("contactOwner")}</button>
        </div>
      </div>
    </motion.article>
  );
}
