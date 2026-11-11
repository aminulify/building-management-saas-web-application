"use client";

import { Camera, Pencil } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { PersonAvatarLike } from "../../owner/profile/PersonAvatarLike";
import { statusKey } from "./logic";
import type { TenantOverview } from "./types";

interface Props { data: TenantOverview; onAvatar: () => void; onEdit: () => void }

/** Gradient strip, round photo overlapping it (click to change), name, @username • status, and Update Profile. */
export function ProfileHero({ data, onAvatar, onEdit }: Props) {
  const t = useTranslations("tenant.profile");
  const reduce = useReducedMotion();
  const { user } = data;

  return (
    <section aria-label={t("heroAria")} className="overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="h-16 bg-gradient-to-r from-[#48BDFA] via-[#9B5CF0] to-[#F413E6] sm:h-20" aria-hidden />
      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-wrap items-end gap-x-5 gap-y-3 sm:-mt-14">
          <button type="button" onClick={onAvatar} aria-label={t("changePhoto")} className="group relative size-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0 sm:size-28">
            <PersonAvatarLike name={user.fullName} url={user.avatarUrl} />
            <span className="absolute inset-0 grid place-items-center bg-slate-900/45 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-6" aria-hidden /></span>
          </button>
          <motion.div className="min-w-0 flex-1 pb-1" initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <h1 className="truncate text-[1.4rem] font-bold text-navy">{user.fullName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>@{user.username}</span><span aria-hidden>•</span>
              <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold", "bg-green-100 text-green-700")}><i aria-hidden className="size-1.5 rounded-full bg-current" />{t(`status.${statusKey(user.role)}`)}</span>
            </p>
          </motion.div>
          <button type="button" onClick={onEdit} className="btn btn-primary h-11 px-5 text-sm"><Pencil className="size-4" aria-hidden />{t("update")}</button>
        </div>
      </div>
    </section>
  );
}
