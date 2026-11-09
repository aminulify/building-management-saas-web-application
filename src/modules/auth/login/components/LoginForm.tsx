"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Lock, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { GradientButton } from "@/components/glass/GradientButton";
import { PasswordToggle } from "@/components/glass/PasswordToggle";
import { hl } from "@/components/typography/highlight";
import { FadeIn } from "@/components/motion/FadeIn";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { POST_LOGIN_PATH, safeNext, setSession } from "@/lib/auth-client";
import { loginFormSchema, type LoginFormValues } from "../schema";
import { GoogleButton } from "./GoogleButton";

interface LoginResult {
  session: { accessToken: string; refreshToken: string; expiresAt: number | null };
  user: { fullName: string; role: string };
}

export function LoginForm() {
  const t = useTranslations("auth.login");
  const v = useTranslations("validation");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const { register, handleSubmit, formState: { errors }, setFocus } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: "onTouched",
    defaultValues: { identifier: "", password: "", remember: false },
  });

  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false); // no native submit before React is attached
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => { if (banner) bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [banner]);

  const msg = (key?: string) => (key ? (v.has(key) ? v(key) : key) : undefined);

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await api<LoginResult>("/auth/login", { method: "POST", body: { identifier: values.identifier.trim().toLowerCase(), password: values.password } });
      setSession(res.session, values.remember);
      setDone(true);
      setTimeout(() => router.replace((next ?? POST_LOGIN_PATH) as never), 700);
    } catch (e) {
      setSubmitting(false);
      if (!(e instanceof ApiError)) { setBanner(t("errors.generic")); return; }
      switch (e.code) {
        case "UNAUTHENTICATED": setBanner(t("errors.invalidCredentials")); setFocus("password"); break;
        case "ACCOUNT_SUSPENDED": setBanner(t("errors.suspended")); break;
        case "EMAIL_NOT_CONFIRMED": setBanner(t("errors.emailNotConfirmed")); break;
        case "RATE_LIMITED": {
          const ms = Number((e.details as { retryAfterMs?: number } | undefined)?.retryAfterMs ?? 0);
          setBanner(t("errors.tooManyAttempts", { minutes: Math.max(1, Math.ceil(ms / 60_000)) }));
          break;
        }
        case "NETWORK": setBanner(t("errors.network")); break;
        default: setBanner(t("errors.generic"));
      }
    }
  });

  return (
    <>
      <FadeIn>
        <h1 className="text-[1.75rem] font-bold leading-snug text-navy sm:text-[2rem]">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">{t("subtitle")}</p>
        <hr className="mt-5 border-slate-400/50" />
      </FadeIn>

      <FadeIn delay={0.1} className="mt-7">
        <h2 className="text-[1.4rem] font-bold leading-snug text-navy">{t.rich("sectionTitle", { hl })}</h2>
        <p className="mb-6 mt-1 text-sm text-slate-600">{t("sectionSubtitle")}</p>

        <form noValidate method="post" onSubmit={onSubmit} className="space-y-5" aria-busy={submitting || undefined}>
          <GlassField label={t("fields.identifier")} htmlFor="identifier" error={msg(errors.identifier?.message)}>
            <GlassInput
              id="identifier" icon={Mail} autoComplete="username" autoCapitalize="none" spellCheck={false}
              placeholder={t("placeholders.identifier")} invalid={!!errors.identifier} disabled={submitting || done} {...register("identifier")}
            />
          </GlassField>

          <GlassField
            label={t("fields.password")} htmlFor="password" error={msg(errors.password?.message)}
            labelRight={<Link href="/forgot-password" className="text-xs font-bold uppercase tracking-wider text-[#00AEEF] transition-opacity hover:opacity-80">{t("forgot")}</Link>}
          >
            <GlassInput
              id="password" type={showPw ? "text" : "password"} icon={Lock} autoComplete="current-password" placeholder="••••••••••"
              invalid={!!errors.password} disabled={submitting || done}
              right={<PasswordToggle shown={showPw} onClick={() => setShowPw((s) => !s)} label={showPw ? t("hidePassword") : t("showPassword")} />}
              {...register("password")}
            />
          </GlassField>

          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-navy">
            <input type="checkbox" className="size-4.5 cursor-pointer rounded accent-brand-pink" disabled={submitting || done} {...register("remember")} />
            {t("stayLoggedIn")}
          </label>

          {banner && (
            <div ref={bannerRef} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}
            </div>
          )}

          <GradientButton type="submit" block loading={submitting && !done} disabled={!ready || done} className="h-12 text-base">
            {done ? <><CheckCircle2 className="size-5" aria-hidden />{t("success")}</> : <>{submitting ? t("submitting") : t("submit")}{!submitting && <ArrowRight className="size-5" aria-hidden />}</>}
          </GradientButton>
        </form>

        <div className="my-6 flex items-center gap-4" role="separator" aria-label={t("orContinue")}>
          <span className="h-px flex-1 bg-slate-300/80" />
          <span className="text-xs font-bold uppercase tracking-wider text-label">{t("orContinue")}</span>
          <span className="h-px flex-1 bg-slate-300/80" />
        </div>

        <GoogleButton next={next} onError={setBanner} disabled={submitting || done} />

        <p className="mt-7 text-center text-sm text-slate-600">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-bold text-[#00AEEF] underline-offset-4 transition-opacity hover:underline hover:opacity-80">{t("createAccount")}</Link>
        </p>
      </FadeIn>
    </>
  );
}
