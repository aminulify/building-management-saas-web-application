"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { GlassCard } from "@/components/glass/GlassCard";
import { buttonClass, GradientButton } from "@/components/glass/GradientButton";
import { Logo } from "@/components/layout/Logo";
import { hl } from "@/components/typography/highlight";
import { Link } from "@/i18n/navigation";

/** Catches render/runtime errors in any page below [locale] and offers a retry instead of a blank screen. */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPages.error");

  useEffect(() => {
    console.error(error); // Sentry hooks in here with the hardening module
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <AmbientBackground />
      <GlassCard className="w-full max-w-lg p-8 text-center sm:p-12" role="alert">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <h1 className="text-2xl font-bold leading-snug text-navy sm:text-3xl">{t.rich("title", { hl })}</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">{t("text")}</p>
        {error.digest && <p className="mt-3 text-xs text-label">{t("reference")}: {error.digest}</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <GradientButton onClick={reset}><RefreshCw className="size-4" aria-hidden />{t("retry")}</GradientButton>
          <Link href="/" className={buttonClass("glass")}>{t("home")}</Link>
        </div>
      </GlassCard>
    </main>
  );
}
