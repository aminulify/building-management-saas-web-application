"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Check, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { GradientButton } from "@/components/glass/GradientButton";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { OTP_LENGTH } from "../schema";
import { getRecovery, setRecovery } from "../storage";
import { BackToLogin } from "./BackToLogin";
import { Badge } from "./Badge";
import { ErrorBanner } from "./ErrorBanner";
import { OtpInput } from "./OtpInput";

const RESEND_SECONDS = 60;

export function OtpForm() {
  const t = useTranslations("auth.recovery");
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resentNote, setResentNote] = useState(false);
  const busy = useRef(false);

  // the email comes from step 1; without it there is nothing to verify
  useEffect(() => {
    const e = getRecovery().email;
    if (!e) router.replace("/forgot-password");
    else setEmail(e);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const rateMessage = (e: ApiError) => {
    const ms = Number((e.details as { retryAfterMs?: number } | undefined)?.retryAfterMs ?? 0);
    return t("errors.tooManyAttempts", { minutes: Math.max(1, Math.ceil(ms / 60_000)) });
  };

  const verify = useCallback(async (token: string) => {
    if (!email || busy.current || token.length !== OTP_LENGTH) return;
    busy.current = true;
    setBanner(null);
    setInvalid(false);
    setSubmitting(true);
    try {
      const res = await api<{ accessToken: string }>("/auth/password/verify", { method: "POST", body: { email, token } });
      setRecovery({ token: res.accessToken });
      setDone(true);
      setTimeout(() => router.push("/reset-password"), 600);
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiError && e.code === "UNAUTHENTICATED") { setInvalid(true); setBanner(t("errors.invalidCode")); setCode(""); }
      else if (e instanceof ApiError && e.code === "RATE_LIMITED") setBanner(rateMessage(e));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, router, t]);

  const resend = async () => {
    if (!email || cooldown > 0 || resending) return;
    setBanner(null);
    setResending(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email } });
      setCooldown(RESEND_SECONDS);
      setCode("");
      setResentNote(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") setBanner(rateMessage(e));
      else if (e instanceof ApiError && e.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    } finally {
      setResending(false);
    }
  };

  if (!email) return <div className="skeleton h-72 w-full" aria-busy="true" />;

  return (
    <>
      <div className="flex justify-center"><Badge icon={Mail} /></div>

      <FadeIn delay={0.1} className="mt-6">
        <h1 className="text-[1.75rem] font-bold leading-snug text-navy">{t.rich("otp.title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">{t("otp.subtitle")}</p>
        <hr className="mt-5 border-slate-400/50" />
      </FadeIn>

      <FadeIn delay={0.16} className="mt-5"><BackToLogin /></FadeIn>

      <form
        noValidate method="post" className="mt-8 space-y-6" aria-busy={submitting || undefined}
        onSubmit={(e) => { e.preventDefault(); if (code.length < OTP_LENGTH) { setInvalid(true); setBanner(t("errors.codeIncomplete")); return; } void verify(code); }}
      >
        <OtpInput
          value={code} onChange={(c) => { setCode(c); if (invalid) setInvalid(false); }} onComplete={(c) => void verify(c)}
          disabled={submitting || done} invalid={invalid} label={t("otp.label")} boxLabel={(n) => t("otp.digit", { n })}
        />

        <ErrorBanner message={banner} />
        {resentNote && !banner && (
          <p role="status" className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600"><Check className="size-4" aria-hidden />{t("otp.resent")}</p>
        )}

        <GradientButton type="submit" block loading={submitting && !done} disabled={done} className="h-12 text-base">
          {done ? <><CheckCircle2 className="size-5" aria-hidden />{t("otp.verified")}</> : <>{submitting ? t("otp.submitting") : t("otp.submit")}{!submitting && <Check className="size-5" aria-hidden />}</>}
        </GradientButton>

        <p className="text-center text-sm text-slate-600">
          {t("otp.noEmail")}{" "}
          {cooldown > 0 ? (
            <span className="font-medium text-label" aria-live="polite">{t("otp.resendIn", { seconds: cooldown })}</span>
          ) : (
            <button suppressHydrationWarning type="button" onClick={resend} disabled={resending} className="font-bold text-[#00AEEF] underline-offset-4 transition-opacity hover:underline hover:opacity-80 disabled:opacity-50">
              {resending ? t("otp.resending") : t("otp.resend")}
            </button>
          )}
        </p>
      </form>
    </>
  );
}
