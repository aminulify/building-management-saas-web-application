"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buttonClass } from "@/components/glass/GradientButton";
import { hl } from "@/components/typography/highlight";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { POST_LOGIN_PATH, safeNext, setSession } from "@/lib/auth-client";
import { NEXT_KEY } from "./GoogleButton";

/** Landing page after Google: reads the session Supabase put in the URL fragment, removes it from the URL, and finishes sign-in. */
export function AuthCallback() {
  const t = useTranslations("auth.login.callback");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in dev
    started.current = true;

    const raw = window.location.hash.replace(/^#/, "") || window.location.search.replace(/^\?/, "");
    const p = new URLSearchParams(raw);
    window.history.replaceState(null, "", window.location.pathname); // tokens must not stay in the address bar

    const access = p.get("access_token");
    if (p.get("error") || p.get("error_description") || !access) { setError(t("cancelled")); return; }

    (async () => {
      try {
        await api("/auth/oauth/complete", { method: "POST", token: access, body: { locale } });
        setSession({ accessToken: access, refreshToken: p.get("refresh_token") ?? undefined, expiresAt: Number(p.get("expires_at")) || null }, true);
        let next: string | null = null;
        try { next = safeNext(sessionStorage.getItem(NEXT_KEY)); sessionStorage.removeItem(NEXT_KEY); } catch { /* ignore */ }
        router.replace((next ?? POST_LOGIN_PATH) as never);
      } catch (e) {
        if (e instanceof ApiError && e.code === "CONFLICT") setError(t("emailRegistered"));
        else if (e instanceof ApiError && e.code === "ACCOUNT_SUSPENDED") setError(t("suspended"));
        else if (e instanceof ApiError && e.code === "FORBIDDEN") setError(t("emailNotVerified"));
        else if (e instanceof ApiError && e.code === "NETWORK") setError(t("network"));
        else setError(t("failed"));
      }
    })();
  }, [locale, router, t]);

  if (error) {
    return (
      <div role="alert" className="text-center">
        <h1 className="text-2xl font-bold text-navy">{t.rich("failedTitle", { hl })}</h1>
        <p className="mx-auto mt-4 flex max-w-sm items-start justify-center gap-2 text-left text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}
        </p>
        <Link href="/login" className={`${buttonClass("primary")} mt-8 inline-flex px-8`}>{t("backToLogin")}</Link>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="py-6 text-center">
      <Loader2 className="mx-auto size-10 animate-spin text-brand-pink" aria-hidden />
      <h1 className="mt-5 text-2xl font-bold text-navy">{t.rich("title", { hl })}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("signingIn")}</p>
    </div>
  );
}
