"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { PRIORITIES } from "../dashboard/logic";
import type { Priority } from "./types";

export const PRIORITY_STYLE: Record<Priority, { pill: string; on: string; box: string }> = {
  CRITICAL: { pill: "bg-red-100 text-red-700", on: "border-red-400 bg-red-50 text-red-700 ring-2 ring-red-100", box: "bg-red-50 text-red-500" },
  HIGH: { pill: "bg-orange-100 text-orange-700", on: "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-100", box: "bg-orange-50 text-orange-500" },
  MEDIUM: { pill: "bg-sky-100 text-sky-700", on: "border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-100", box: "bg-sky-50 text-sky-500" },
  LOW: { pill: "bg-yellow-100 text-yellow-700", on: "border-yellow-400 bg-yellow-50 text-yellow-700 ring-2 ring-yellow-100", box: "bg-yellow-50 text-yellow-600" },
};
const ORDER: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

interface Props { value: Priority; onChange: (p: Priority) => void; disabled?: boolean; label: string }

/** Priority as pills (Critical / High / Medium / Low): a radio group, usable with the arrow keys. */
export function PriorityPills({ value, onChange, disabled, label }: Props) {
  const t = useTranslations("owner.maintenance.priority");
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {ORDER.filter((p) => (PRIORITIES as readonly string[]).includes(p)).map((p) => {
        const on = value === p;
        return (
          <button key={p} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(p)}
            className={clsx("h-10 rounded-full border px-4 text-sm font-bold transition-all duration-300 disabled:opacity-60", on ? PRIORITY_STYLE[p].on : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white")}>{t(p)}</button>
        );
      })}
    </div>
  );
}
