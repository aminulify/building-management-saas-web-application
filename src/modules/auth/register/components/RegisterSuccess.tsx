"use client";

import { MailCheck, PartyPopper, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hl } from "@/components/typography/highlight";
import { buttonClass } from "@/components/glass/GradientButton";

interface Props {
  needsEmailConfirmation: boolean;
  email: string;
  /** NID/photo upload outcome from the server (null = nothing was uploaded) */
  documentsReceived: boolean;
}

export function RegisterSuccess({ needsEmailConfirmation, email, documentsReceived }: Props) {
  const t = useTranslations("auth.register.success");
  const Icon = needsEmailConfirmation ? MailCheck : PartyPopper;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-xl py-6 text-center" role="status" aria-live="polite">
      <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full bg-linear-to-br from-brand-pink/20 to-brand-blue/25 text-brand-pink shadow-inner">
        <Icon className="size-10" aria-hidden />
      </div>
      <h2 className="text-3xl font-bold leading-snug text-navy sm:text-4xl">{t.rich("title", { hl })}</h2>
      <p className="mt-3 text-label">{needsEmailConfirmation ? t("confirmEmail", { email }) : t("ready")}</p>
      {documentsReceived && (
        <p className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-left text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("documentsReceived")}
        </p>
      )}
      <Link href="/login" className={`${buttonClass("primary")} mt-8 inline-flex px-10`}>{t("goLogin")}</Link>
    </motion.div>
  );
}
