"use client";

import { Crown, Hourglass, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuthQuery } from "@/lib/use-auth-query";

interface Props { onNavigate?: () => void; /** tablet icon rail: just the crown, linking to the same page */ compact?: boolean }
interface Mine { status: string }

/**
 * The "Free Plan" card of a Tenant-Free account, above the profile: what a plan unlocks, and "Upgrade Now" → Subscription.
 * While a payment waits for approval it says so instead. It is never shown to verified tenants (the sidebar decides).
 */
export function FreePlanCard({ onNavigate, compact = false }: Props) {
  const t = useTranslations("tenant.freePlan");
  const reduce = useReducedMotion();
  const mine = useAuthQuery<Mine[]>("/upgrade-requests/mine");
  const waiting = (mine.data ?? []).some((r) => r.status === "PENDING");

  if (compact) {
    return (
      <Link href={"/tenant-free/subscription" as never} onClick={onNavigate} title={t("cta")} aria-label={t(waiting ? "waitingCta" : "cta")}
        className="mb-3 grid size-11 place-items-center self-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)] transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0">
        {waiting ? <Hourglass className="size-5" aria-hidden /> : <Crown className="size-5" aria-hidden />}
      </Link>
    );
  }

  return (
    <motion.section
      aria-label={t("title")} initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0B1437] via-[#101C4D] to-[#1A1450] p-4 shadow-[0_14px_34px_-16px_rgba(11,20,55,0.8)]"
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-[#F413E6]/30 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 -left-8 size-24 rounded-full bg-[#48BDFA]/20 blur-2xl" />
      <h2 className="relative flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wider text-[#FF4FF2] [text-shadow:0_0_14px_rgba(244,19,230,0.7)]"><Zap className="size-4 fill-current" aria-hidden />{t("title")}</h2>
      <p className="relative mt-2 text-xs leading-relaxed text-slate-300">{waiting ? t("waitingCopy") : t("copy")}</p>
      <Link href={"/tenant-free/subscription" as never} onClick={onNavigate} className={clsx("btn relative mt-3 h-10 w-full text-[0.82rem]", waiting ? "btn-white" : "btn-primary")}>
        {t(waiting ? "waitingCta" : "cta")}
      </Link>
    </motion.section>
  );
}
