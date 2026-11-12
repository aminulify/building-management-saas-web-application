"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, Loader2, Megaphone, Send } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { authApi } from "@/lib/auth-client";
import { formatCount, formatTaka } from "../dashboard/format";
import type { Audience, ReminderPreview } from "./types";

const LOOK: Record<Audience, { box: string; icon: typeof AlertTriangle; chip: string; button: string }> = {
  expiring: { box: "border-yellow-300 bg-yellow-100/60", icon: AlertTriangle, chip: "bg-yellow-200/80 text-yellow-700", button: "bg-[#EAB308] text-white shadow-[0_8px_18px_-8px_rgba(234,179,8,0.8)] hover:bg-[#CA9A06]" },
  expired: { box: "border-red-300 bg-red-100/60", icon: AlertOctagon, chip: "bg-red-200/80 text-red-700", button: "bg-[#EF4444] text-white shadow-[0_8px_18px_-8px_rgba(239,68,68,0.8)] hover:bg-[#DC2626]" },
  all: { box: "border-sky-300 bg-sky-100/60", icon: Megaphone, chip: "bg-sky-200/80 text-[#0A84F0]", button: "bg-[#0A84F0] text-white shadow-[0_8px_18px_-8px_rgba(10,132,240,0.8)] hover:bg-[#0873D6]" },
};

function Banner({ audience, index, tick, onOpen }: { audience: Audience; index: number; tick: number; onOpen: (a: Audience, p: ReminderPreview) => void }) {
  const t = useTranslations("admin.subs.banner");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const [data, setData] = useState<ReminderPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let live = true;
    authApi<ReminderPreview>(`/admin/subscriptions/reminder?audience=${audience}`).then((r) => { if (live) { setData(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [audience, tick]);
  const look = LOOK[audience], Icon = look.icon;
  const nobody = state === "ready" && data?.count === 0;
  return (
    <motion.div initial={{ opacity: 0, y: reduce ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.06 }}
      className={clsx("flex flex-col gap-3 rounded-2xl border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center sm:justify-between sm:p-5", look.box)}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className={clsx("grid size-12 shrink-0 place-items-center rounded-xl", look.chip)}><Icon className="size-6" /></span>
        <div className="min-w-0">
          <p className="font-bold text-navy">{t(`${audience}.title`)}</p>
          <p className="text-xs text-slate-600">{t(`${audience}.sub`, { days: data?.expiringDays ?? 7 })}</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">
            {state === "loading" ? "…" : state === "error" || !data ? t("error") : audience === "all" ? t("everyone", { n: formatCount(locale)(data.count) }) : t("due", { n: formatCount(locale)(data.count), amount: formatTaka(locale)(Number(data.totalDue)) })}
          </p>
        </div>
      </div>
      <button type="button" disabled={state !== "ready" || nobody} onClick={() => data && onOpen(audience, data)} title={nobody ? t("nobody") : undefined} className={clsx("inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#48BDFA]", look.button)}>
        {state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}{t("cta")}
      </button>
    </motion.div>
  );
}

/** Three banners: remind owners who are about to expire, owners who expired, or send a message to every owner. */
export function ReminderBanners({ tick, onOpen }: { tick: number; onOpen: (a: Audience, p: ReminderPreview) => void }) {
  return <div className="space-y-3">{(["expiring", "expired", "all"] as const).map((a, i) => <Banner key={a} audience={a} index={i} tick={tick} onOpen={onOpen} />)}</div>;
}
