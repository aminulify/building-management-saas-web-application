"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Availability } from "../hooks";

/** Little status icon on the right of an input: checking / available / taken. */
export function AvailabilityBadge({ state }: { state: Availability }) {
  const t = useTranslations("auth.register");
  if (state === "checking") return <Loader2 className="size-4 animate-spin text-slate-400" aria-label={t("checking")} />;
  if (state === "available") return <CheckCircle2 className="size-5 text-emerald-500" aria-label={t("available")} />;
  if (state === "taken") return <XCircle className="size-5 text-red-500" aria-label={t("taken")} />;
  return null;
}
