"use client";

import { ClipboardList, CalendarClock, Flag, Tag } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslations } from "next-intl";
import { GlassField, GlassInput, GlassSelect } from "@/components/glass/GlassField";
import { REPAIR_CATEGORIES } from "../dashboard/logic";
import { PriorityPills } from "./PriorityPills";
import type { RequestValues } from "./logic";
import type { Priority } from "./types";

interface Props {
  idp: string;
  register: UseFormRegister<RequestValues>;
  errors: FieldErrors<RequestValues>;
  priority: Priority;
  onPriority: (p: Priority) => void;
  disabled: boolean;
  minLocal: string;
}

/** Title, category, priority, description and preferred time: the same fields in "+ New Request" and "Edit Issue". */
export function RequestFields({ idp, register, errors, priority, onPriority, disabled, minLocal }: Props) {
  const t = useTranslations("tenant.maintenance.form");
  const c = useTranslations("tenant.dashboard.repair.categories");
  const v = useTranslations("validation");
  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);
  return (
    <>
      <GlassField label={t("title")} htmlFor={`${idp}-title`} error={msg(errors.title?.message)}>
        <GlassInput id={`${idp}-title`} icon={ClipboardList} placeholder={t("titlePlaceholder")} invalid={!!errors.title} disabled={disabled} data-autofocus {...register("title")} />
      </GlassField>
      <div className="grid gap-4 sm:grid-cols-2">
        <GlassField label={t("category")} htmlFor={`${idp}-category`} error={msg(errors.category?.message)}>
          <GlassSelect id={`${idp}-category`} icon={Tag} disabled={disabled} {...register("category")}>{REPAIR_CATEGORIES.map((k) => <option key={k} value={k}>{c(k)}</option>)}</GlassSelect>
        </GlassField>
        <GlassField label={t("preferred")} htmlFor={`${idp}-preferred`} error={msg(errors.preferred?.message)} hint={t("preferredHint")}>
          <GlassInput id={`${idp}-preferred`} icon={CalendarClock} type="datetime-local" min={minLocal} invalid={!!errors.preferred} disabled={disabled} {...register("preferred")} />
        </GlassField>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-label"><Flag className="size-3.5" aria-hidden />{t("priority")}</p>
        <PriorityPills value={priority} onChange={onPriority} disabled={disabled} label={t("priority")} />
      </div>
      <GlassField label={t("description")} htmlFor={`${idp}-desc`} error={msg(errors.description?.message)}>
        <textarea id={`${idp}-desc`} rows={4} maxLength={2000} disabled={disabled} placeholder={t("descriptionPlaceholder")} aria-invalid={!!errors.description || undefined} className="glass-input block w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-300" {...register("description")} />
      </GlassField>
    </>
  );
}
