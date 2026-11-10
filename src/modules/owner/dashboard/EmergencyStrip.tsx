"use client";

import { AlertTriangle, Flame, Shield } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";

export type Service = "POLICE" | "FIRE";

/** Two big buttons at the bottom of the dashboard; each opens the alert form themed for its service. */
export function EmergencyStrip({ onOpen }: { onOpen: (s: Service) => void }) {
  const t = useTranslations("owner.emergency");
  const base = "group flex h-16 items-center justify-center gap-3 rounded-xl border-2 px-4 text-lg font-bold backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <section aria-labelledby="alert-title">
      <h2 id="alert-title" className="mb-3 flex items-center justify-center gap-2 text-xl font-bold text-red-600">
        <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-red-100 text-red-600"><AlertTriangle className="size-5" /></span>
        {t("label")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onOpen("POLICE")} className={clsx(base, "border-red-500 bg-red-200/70 text-red-600 hover:bg-red-200 hover:shadow-red-300/50 focus-visible:outline-red-500")}>
          <Shield className="size-7 transition-transform duration-300 group-hover:scale-110" aria-hidden />{t("police")}
        </button>
        <button type="button" onClick={() => onOpen("FIRE")} className={clsx(base, "border-amber-400 bg-amber-100/80 text-amber-600 hover:bg-amber-100 hover:shadow-amber-300/50 focus-visible:outline-amber-500")}>
          <Flame className="size-7 transition-transform duration-300 group-hover:scale-110" aria-hidden />{t("fire")}
        </button>
      </div>
    </section>
  );
}
