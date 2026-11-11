"use client";

import { Briefcase, CalendarDays, Fingerprint, IdCard, Mail, Phone, User } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import type { Availability } from "../hooks";
import type { RegisterFormValues } from "../schema";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { useFieldError } from "./useFieldError";

interface Props { availability: { username: Availability; email: Availability; phone: Availability } }

const todayIso = () => new Date().toISOString().slice(0, 10);

export function StepPersonal({ availability }: Props) {
  const t = useTranslations("auth.register");
  const { register, formState: { errors } } = useFormContext<RegisterFormValues>();
  const err = useFieldError<RegisterFormValues>();
  const taken = (s: Availability, key: string) => (s === "taken" ? t(key) : undefined);

  return (
    <div className="space-y-6">
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
