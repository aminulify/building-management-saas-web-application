"use client";

import { Camera, Pencil } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber } from "../dashboard/format";
import { PersonAvatarLike } from "./PersonAvatarLike";
import type { OwnerOverview } from "./types";

interface Props { data: OwnerOverview; onAvatar: () => void; onEdit: () => void; onMissing: (key: string) => void }

/** Gradient banner, round photo (click to change), name, @username, member since and the animated profile-strength bar. */
export function ProfileHero({ data, onAvatar, onEdit, onMissing }: Props) {
  const t = useTranslations("owner.profile");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const n = formatNumber(locale);
  const { user, strength } = data;
  const year = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { year: "numeric", timeZone: "UTC" }).format(new Date(user.memberSince));
  const first = strength.missing[0];

  return (
    <section aria-label={t("heroAria")} className="overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="h-16 bg-gradient-to-r from-[#48BDFA] via-[#9B5CF0] to-[#F413E6] sm:h-20" aria-hidden />
      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-wrap items-end gap-x-5 gap-y-3 sm:-mt-14">
          <button type="button" onClick={onAvatar} aria-label={t("changePhoto")} className="group relative size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0 sm:size-28">
            <PersonAvatarLike name={user.fullName} url={user.avatarUrl} />
            <span className="absolute inset-0 grid place-items-center bg-slate-900/45 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-6" aria-hidden /></span>
          </button>
          <motion.div className="min-w-0 flex-1 pb-1" initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <h1 className="truncate text-xl font-bold text-navy sm:text-[1.4rem]">{user.fullName}</h1>
            <p className="text-xs text-slate-500">@{user.username} <span aria-hidden>•</span> <span className="font-semibold text-[#0A84F0]">{t("memberSince", { year })}</span></p>
          </motion.div>
          <button type="button" onClick={onEdit} className="btn btn-primary h-11 px-5 text-sm"><Pencil className="size-4" aria-hidden />{t("update")}</button>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-navy" id="strength-label">{t("strength")}: <CountUp value={strength.percent} format={(v) => `${n(v)}%`} /></p>
            {first && <button type="button" onClick={() => onMissing(first)} className="text-xs font-semibold text-[#0A84F0] underline-offset-2 hover:underline">{t(`missing.${first}` as never)}</button>}
          </div>
          <div role="progressbar" aria-labelledby="strength-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength.percent} className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/80">
            <motion.div className="h-full rounded-full bg-brand-gradient" initial={{ width: reduce ? `${strength.percent}%` : 0 }} animate={{ width: `${strength.percent}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
