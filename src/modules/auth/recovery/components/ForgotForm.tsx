"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { GradientButton } from "@/components/glass/GradientButton";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { forgotFormSchema, type ForgotFormValues } from "../schema";
import { getRecovery, setRecovery } from "../storage";
import { BackToLogin } from "./BackToLogin";
import { ErrorBanner } from "./ErrorBanner";

export function ForgotForm() {
  const t = useTranslations("auth.recovery");
  const v = useTranslations("validation");
  const router = useRouter();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotFormSchema), mode: "onTouched", defaultValues: { email: "" },
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // no native submit before React is attached

  useEffect(() => { setReady(true); const e = getRecovery().email; if (e) setValue("email", e); }, [setValue]);

  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  const onSubmit = handleSubmit(async ({ email }) => {
    setBanner(null);
    setSubmitting(true);
    const clean = email.trim().toLowerCase();
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email: clean } });
      setRecovery({ email: clean, token: undefined });
      setDone(true);
      setTimeout(() => router.push("/verify-code"), 600);
    } catch (e) {
      setSubmitting(false);
      if (!(e instanceof ApiError)) setBanner(t("errors.generic"));
      else if (e.code === "RATE_LIMITED") {
        const ms = Number((e.details as { retryAfterMs?: number } | undefined)?.retryAfterMs ?? 0);
        setBanner(t("errors.tooManyAttempts", { minutes: Math.max(1, Math.ceil(ms / 60_000)) }));
      } else if (e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  });

  return (
    <>
      <FadeIn>
        <h1 className="text-[1.75rem] font-bold leading-snug text-navy">{t.rich("forgot.title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">{t("forgot.subtitle")}</p>
        <hr className="mt-5 border-slate-400/50" />
      </FadeIn>

      <FadeIn delay={0.08} className="mt-5"><BackToLogin /></FadeIn>

      <FadeIn delay={0.16} className="mt-8">
        <h2 className="text-[1.4rem] font-bold leading-snug text-navy">{t.rich("forgot.sectionTitle", { hl })}</h2>
        <p className="mb-6 mt-1 text-sm text-slate-600">{t("forgot.sectionSubtitle")}</p>

        <form noValidate method="post" onSubmit={onSubmit} className="space-y-5" aria-busy={submitting || undefined}>
          <GlassField label={t("fields.email")} htmlFor="email" error={msg(errors.email?.message)}>
            <GlassInput
              id="email" type="email" icon={Mail} autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email"
              placeholder={t("placeholders.email")} invalid={!!errors.email} disabled={submitting || done} {...register("email")}
            />
          </GlassField>

          <ErrorBanner message={banner} />

          <GradientButton type="submit" block loading={submitting && !done} disabled={!ready || done} className="h-12 text-base">
            {done ? <><CheckCircle2 className="size-5" aria-hidden />{t("forgot.sent")}</> : <>{submitting ? t("forgot.submitting") : t("forgot.submit")}{!submitting && <ArrowRight className="size-5" aria-hidden />}</>}
          </GradientButton>
        </form>
      </FadeIn>
    </>
  );
}
