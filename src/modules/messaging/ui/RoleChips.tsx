"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";

export type RoleFilter = "all" | "GENERAL_USER" | "TENANT" | "OWNER" | "GOV_ADMIN";
export const ROLE_FILTERS: RoleFilter[] = ["all", "GENERAL_USER", "TENANT", "OWNER", "GOV_ADMIN"];

/** Admin filter under the search box: everyone, Tenant Free, Tenants, Owners, Government. */
export function RoleChips({ value, onChange, className }: { value: RoleFilter; onChange: (v: RoleFilter) => void; className?: string }) {
  const t = useTranslations("chat.filter");
  return (
    <div role="group" aria-label={t("aria")} className={clsx("flex gap-1.5 overflow-x-auto", className)}>
      {ROLE_FILTERS.map((r) => (
        <button key={r} type="button" aria-pressed={value === r} onClick={() => onChange(r)} className={clsx("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-[#48BDFA]", value === r ? "border-[#0A84F0] bg-[#0A84F0] text-white shadow-[0_6px_14px_-8px_rgba(10,132,240,0.8)]" : "border-slate-200 bg-white/70 text-slate-600 hover:border-[#48BDFA] hover:text-[#0A84F0]")}>
          {t(r)}
        </button>
      ))}
    </div>
  );
}
