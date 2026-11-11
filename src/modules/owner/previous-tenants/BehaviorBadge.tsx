"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { BEHAVIOR_STYLE } from "./logic";
import type { Behavior } from "./types";

/** ● Good (green) · Average (blue) · Ugly (yellow) · Very Bad (red)… or "Not rated". */
export function BehaviorBadge({ value, className }: { value: Behavior | null; className?: string }) {
  const t = useTranslations("owner.previousTenants.behavior");
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", value ? BEHAVIOR_STYLE[value] : "border-slate-300 bg-slate-100/90 text-slate-600", className)}>
      <i aria-hidden className="size-1.5 rounded-full bg-current" />{value ? t(value) : t("UNRATED")}
    </span>
  );
}
