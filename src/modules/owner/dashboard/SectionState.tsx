"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

/** Inline error for one dashboard section, with a retry button (the rest of the page keeps working). */
export function SectionError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const t = useTranslations("owner");
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-8 text-center text-sm text-red-700 ${className ?? ""}`}>
      <AlertTriangle className="size-6" aria-hidden />
      <p>{t("sectionError")}</p>
      <button type="button" onClick={onRetry} className="btn btn-white h-9 px-4 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
    </div>
  );
}
