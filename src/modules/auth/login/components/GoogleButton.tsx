"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GradientButton } from "@/components/glass/GradientButton";
import { api, ApiError } from "@/lib/api-client";
import { safeNext } from "@/lib/auth-client";
import { GoogleIcon } from "./GoogleIcon";

export const NEXT_KEY = "ag.next";

interface Props {
  /** destination after sign-in (from ?next=) */
  next: string | null;
  onError: (message: string | null) => void;
  disabled?: boolean;
}

/** Real Google sign-in: our API builds the Supabase OAuth URL, the browser goes to Google and comes back to /auth/callback. */
export function GoogleButton({ next, onError, disabled }: Props) {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const [available, setAvailable] = useState<boolean | null>(null); // null = still checking
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ google: boolean }>("/auth/providers", { signal: ctrl.signal })
      .then((p) => setAvailable(p.google))
      .catch((e) => { if ((e as Error).name !== "AbortError") setAvailable(true); }); // unknown: let the click decide
    return () => ctrl.abort();
  }, []);

  async function start() {
    onError(null);
    setBusy(true);
    try {
      try {
        const n = safeNext(next);
        if (n) sessionStorage.setItem(NEXT_KEY, n); else sessionStorage.removeItem(NEXT_KEY);
      } catch { /* storage blocked: falls back to the default destination */ }
      const redirectTo = `${window.location.origin}/${locale}/auth/callback`;
      const { url } = await api<{ url: string }>(`/auth/oauth/google/url?redirectTo=${encodeURIComponent(redirectTo)}`);
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.reason === "google_not_enabled") { setAvailable(false); onError(t("errors.googleUnavailable")); return; }
      onError(e instanceof ApiError && e.code === "NETWORK" ? t("errors.network") : t("errors.googleFailed"));
    }
  }

  return (
    <div>
      <GradientButton variant="white" block loading={busy} disabled={disabled || available === false} onClick={start} className="gap-3 font-semibold">
        {!busy && <GoogleIcon />}
        {t("google")}
      </GradientButton>
      {available === false && <p className="mt-2 text-center text-xs text-label">{t("googleSoon")}</p>}
    </div>
  );
}
