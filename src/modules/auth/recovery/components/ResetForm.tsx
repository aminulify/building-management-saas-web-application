"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { GradientButton, buttonClass } from "@/components/glass/GradientButton";
import { PasswordToggle } from "@/components/glass/PasswordToggle";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { allRulesMet } from "../schema";
import { clearRecovery, getRecovery } from "../storage";
import { BackToLogin } from "./BackToLogin";
import { Badge } from "./Badge";
import { ErrorBanner } from "./ErrorBanner";
import { PasswordChecklist } from "./PasswordChecklist";

export function ResetForm() {
  const t = useTranslations("auth.recovery");
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ pw: false, confirm: false });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // the recovery token comes from step 2 (or from the link in the email); without it start again
  useEffect(() => {
    const tk = getRecovery().token;
    if (!tk) router.replace("/forgot-password");
    else setToken(tk);
  }, [router]);

  if (!token) return <div className="skeleton h-80 w-full" aria-busy="true" />;

  if (expired) {
    return (
      <FadeIn className="text-center" >
        <div className="flex justify-center"><Badge icon={ShieldCheck} /></div>
        <h1 className="mt-6 text-[1.75rem] font-bold text-navy">{t.rich("reset.expiredTitle", { hl })}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">{t("reset.expiredText")}</p>
        <Link href="/forgot-password" onClick={clearRecovery} className={`${buttonClass("primary")} mt-8 inline-flex px-8`}>{t("reset.startAgain")}</Link>
      </FadeIn>
    );
  }

  const valid = allRulesMet(password, confirm);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting || done) return;
    setBanner(null);
    setSubmitting(true);
    try {
      await api("/auth/password/reset", { method: "POST", token, body: { password } });
      clearRecovery();
      setDone(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "UNAUTHENTICATED") setExpired(true);
      else if (err instanceof ApiError && err.code === "VALIDATION_ERROR") setBanner(t("errors.passwordRejected"));
      else if (err instanceof ApiError && err.code === "NETWORK") setBanner(t("errors.network"));
      else setBanner(t("errors.generic"));
    }
  };

  return (
    <>
      <FadeIn>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 backdrop-blur-sm" role="status">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white"><CheckCircle2 className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight text-emerald-800">{t("reset.bannerTitle")}</p>
            <p className="text-sm leading-tight text-emerald-600">{t("reset.bannerText")}</p>
          </div>
          <span aria-hidden className="size-3 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        </div>
      </FadeIn>

      <FadeIn delay={0.1} className="mt-6">
        <div className="flex items-center gap-4">
          <Badge icon={Fingerprint} size="sm" />
          <div>
            <h1 className="text-[1.75rem] font-bold leading-snug text-navy">{t.rich("reset.title", { hl })}</h1>
            <p className="text-sm text-slate-600">{t("reset.subtitle")}</p>
          </div>
        </div>
        <hr className="mt-5 border-slate-400/50" />
      </FadeIn>

      <FadeIn delay={0.16} className="mt-5"><BackToLogin /></FadeIn>

      <FadeIn delay={0.22} className="mt-7">
        <form noValidate method="post" onSubmit={onSubmit} className="space-y-5" aria-busy={submitting || undefined}>
          <GlassField label={t("fields.newPassword")} htmlFor="newPassword">
            <GlassInput
              id="newPassword" type={show.pw ? "text" : "password"} icon={Lock} autoComplete="new-password" maxLength={72}
              placeholder={t("placeholders.newPassword")} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting || done}
              right={<PasswordToggle shown={show.pw} onClick={() => setShow((s) => ({ ...s, pw: !s.pw }))} label={show.pw ? t("hidePassword") : t("showPassword")} />}
            />
          </GlassField>

          <GlassField label={t("fields.confirmPassword")} htmlFor="confirmPassword">
            <GlassInput
              id="confirmPassword" type={show.confirm ? "text" : "password"} icon={Lock} autoComplete="new-password" maxLength={72}
              placeholder={t("placeholders.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={submitting || done}
              right={<PasswordToggle shown={show.confirm} onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} label={show.confirm ? t("hidePassword") : t("showPassword")} />}
            />
          </GlassField>

          <PasswordChecklist password={password} confirm={confirm} />

          <ErrorBanner message={banner} />

          <GradientButton type="submit" loading={submitting && !done} disabled={!valid || done} className="h-12 w-full text-base sm:w-64">
            {done ? <><CheckCircle2 className="size-5" aria-hidden />{t("reset.success")}</> : submitting ? t("reset.submitting") : t("reset.submit")}
          </GradientButton>
          {done && <p role="status" className="text-sm font-medium text-emerald-600">{t("reset.successNote")}</p>}
        </form>
      </FadeIn>
    </>
  );
}
