"use client";

import { Briefcase, CalendarDays, Fingerprint, IdCard, Mail, Phone, User } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import type { Availability } from "../hooks";
import { ACCOUNT_ROLES, type RegisterFormValues } from "../schema";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { useFieldError } from "./useFieldError";

interface Props { availability: { username: Availability; email: Availability; phone: Availability } }

const todayIso = () => new Date().toISOString().slice(0, 10);

export function StepPersonal({ availability }: Props) {
  const t = useTranslations("auth.register");
  const { register, watch, setValue, formState: { errors } } = useFormContext<RegisterFormValues>();
  const err = useFieldError<RegisterFormValues>();
  const role = watch("role");
  const taken = (s: Availability, key: string) => (s === "taken" ? t(key) : undefined);

  return (
    <div className="space-y-6">
      {/* account type: needed by the backend (owner / tenant / general user) */}
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("fields.role")}</legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-invalid={!!errors.role}>
          {ACCOUNT_ROLES.map((r) => (
            <label
              key={r}
              className={clsx(
                "glass-input relative cursor-pointer rounded-xl p-3 text-sm transition-all duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
                role === r && "!border-brand-purple bg-white !shadow-[0_0_0_3px_rgba(123,47,247,0.18)]",
              )}
            >
              <input type="radio" value={r} className="sr-only" {...register("role")} onChange={() => setValue("role", r, { shouldValidate: true, shouldDirty: true })} />
              <span className="block font-bold text-navy">{t(`roles.${r}.title`)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-label">{t(`roles.${r}.hint`)}</span>
            </label>
          ))}
        </div>
        {err("role") && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{err("role")}</p>}
      </fieldset>

      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <GlassField label={t("fields.fullName")} htmlFor="fullName" error={err("fullName")}>
          <GlassInput id="fullName" icon={User} autoComplete="name" placeholder={t("placeholders.fullName")} invalid={!!errors.fullName} {...register("fullName")} />
        </GlassField>

        <GlassField label={t("fields.username")} htmlFor="username" error={err("username") ?? taken(availability.username, "usernameTaken")} hint={t("hints.username")}>
          <GlassInput
            id="username" icon={Fingerprint} autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder={t("placeholders.username")} invalid={!!errors.username || availability.username === "taken"}
            right={<AvailabilityBadge state={availability.username} />} {...register("username")}
          />
        </GlassField>

        <GlassField label={t("fields.email")} htmlFor="email" error={err("email") ?? taken(availability.email, "emailTaken")}>
          <GlassInput
            id="email" type="email" icon={Mail} autoComplete="email" inputMode="email"
            placeholder={t("placeholders.email")} invalid={!!errors.email || availability.email === "taken"}
            right={<AvailabilityBadge state={availability.email} />} {...register("email")}
          />
        </GlassField>

        <GlassField label={t("fields.phone")} htmlFor="phone" error={err("phone") ?? taken(availability.phone, "phoneTaken")} hint={t("hints.phone")}>
          <GlassInput
            id="phone" type="tel" icon={Phone} autoComplete="tel" inputMode="tel"
            placeholder={t("placeholders.phone")} invalid={!!errors.phone || availability.phone === "taken"}
            right={<AvailabilityBadge state={availability.phone} />} {...register("phone")}
          />
        </GlassField>

        <GlassField label={t("fields.occupation")} htmlFor="occupation" error={err("occupation")}>
          <GlassInput id="occupation" icon={Briefcase} autoComplete="organization-title" placeholder={t("placeholders.occupation")} invalid={!!errors.occupation} {...register("occupation")} />
        </GlassField>

        <GlassField label={t("fields.dateOfBirth")} htmlFor="dateOfBirth" error={err("dateOfBirth")}>
          <GlassInput id="dateOfBirth" type="date" icon={CalendarDays} autoComplete="bday" min="1900-01-01" max={todayIso()} invalid={!!errors.dateOfBirth} className="[color-scheme:light]" {...register("dateOfBirth")} />
        </GlassField>
      </div>

      <GlassField label={t("fields.nid")} htmlFor="nid" error={err("nid")} hint={t("hints.nid")}>
        <GlassInput id="nid" icon={IdCard} inputMode="numeric" autoComplete="off" maxLength={17} placeholder={t("placeholders.nid")} invalid={!!errors.nid} {...register("nid")} />
      </GlassField>
    </div>
  );
}
