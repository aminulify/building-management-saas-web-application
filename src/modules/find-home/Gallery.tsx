"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

/** Photo carousel: arrows, keyboard (← →), swipe on phones and a thumbnail strip. */
export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const t = useTranslations("owner.findHome.details");
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const touch = useRef<number | null>(null);
  const count = photos.length;
  const go = (to: number) => { if (!count) return; setDir(to >= i ? 1 : -1); setI((to + count) % count); };

  useEffect(() => { setI(0); }, [photos]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "ArrowRight") { setDir(1); setI((v) => (v + 1) % Math.max(count, 1)); }
      if (e.key === "ArrowLeft") { setDir(-1); setI((v) => (v - 1 + count) % Math.max(count, 1)); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count]);

  if (!count) return <div className="grid aspect-[16/9] place-items-center rounded-xl bg-slate-100 text-slate-300"><ImageOff className="size-12" aria-label={t("noPhotos")} /></div>;

  return (
    <div>
      <div
        className="relative aspect-[16/9] overflow-hidden rounded-xl bg-slate-100" role="group" aria-roledescription="carousel" aria-label={t("gallery")}
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const s = touch.current; touch.current = null; const x = e.changedTouches[0]?.clientX; if (s !== null && x !== undefined && Math.abs(x - s) > 40) go(i + (x < s ? 1 : -1)); }}
      >
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.img
            key={photos[i]} src={photos[i]} alt={t("photoOf", { n: i + 1, total: count, title: alt })} draggable={false}
            custom={dir} initial={{ opacity: 0, x: reduce ? 0 : dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : dir * -40 }} transition={{ duration: 0.35 }}
            className="absolute inset-0 size-full object-cover"
          />
        </AnimatePresence>
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(i - 1)} aria-label={t("prev")} className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy shadow backdrop-blur transition-all hover:scale-105 hover:bg-white"><ChevronLeft className="size-5" aria-hidden /></button>
            <button type="button" onClick={() => go(i + 1)} aria-label={t("next")} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-navy shadow backdrop-blur transition-all hover:scale-105 hover:bg-white"><ChevronRight className="size-5" aria-hidden /></button>
            <span aria-live="polite" className="absolute bottom-2 right-2 rounded-full bg-slate-900/60 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">{i + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label={t("thumbs")}>
          {photos.map((p, k) => (
            <button key={p} type="button" role="tab" aria-selected={k === i} aria-label={t("showPhoto", { n: k + 1 })} onClick={() => go(k)}
              className={clsx("relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-1 transition-all duration-300", k === i ? "ring-[#48BDFA]" : "opacity-70 ring-transparent hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
              <img src={p} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
