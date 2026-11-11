import { Building2, DoorOpen, User } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Context } from "./types";

/** Apartment, unit and tenant are filled in by the system and cannot be changed. */
export function ContextTags({ ctx }: { ctx: Context }) {
  const t = useTranslations("tenant.maintenance.tags");
  const tags = [{ icon: Building2, label: t("apartment"), value: ctx.property }, { icon: DoorOpen, label: t("unit"), value: t("unitValue", { unit: ctx.unit }) }, { icon: User, label: t("tenant"), value: ctx.tenant }];
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("aria")}>
      {tags.map((x) => (
        <li key={x.label} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs">
          <x.icon className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="font-semibold text-label">{x.label}:</span><span className="truncate font-bold text-navy">{x.value}</span>
        </li>
      ))}
    </ul>
  );
}
