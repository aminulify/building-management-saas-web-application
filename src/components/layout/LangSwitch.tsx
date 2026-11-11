"use client";

import { useLocale, useTranslations } from "next-intl";
import { clsx } from "clsx";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/** [ BN | EN ] pill. Keeps the current path and query string, only the locale changes. */
export function LangSwitch({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next === locale) return;
    const qs = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`${pathname}${qs}`, { locale: next });
  }

  return (
    <div role="group" aria-label={t("language")} className={clsx("glass-card inline-flex items-center gap-0.5 rounded-full p-1 text-xs font-bold", className)}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={l === locale}
          suppressHydrationWarning // form-filler browser extensions add their own attributes to buttons before React starts
          className={clsx(
            "rounded-full px-3 py-1.5 uppercase transition-colors duration-300",
            l === locale ? "bg-brand-gradient text-white shadow" : "text-label hover:text-navy",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
