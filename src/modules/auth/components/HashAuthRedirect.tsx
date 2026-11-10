"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { setRecovery } from "@/modules/auth/recovery/storage";

/**
 * Safety net for Google sign-in: if the identity provider sends the session to a page other than
 * /auth/callback (for example the site root when the redirect URL is not allow-listed), forward it there
 * with the fragment intact so sign-in still completes.
 */
export function HashAuthRedirect() {
  const locale = useLocale();

  useEffect(() => {
    const { hash, pathname } = window.location;
    if (!/[#&]access_token=/.test(hash) || pathname.endsWith("/auth/callback")) return;
    // a password-recovery link from the email: keep the token in memory-only storage and go to the reset page
    const p = new URLSearchParams(hash.replace(/^#/, ""));
    if (p.get("type") === "recovery" && p.get("access_token")) {
      setRecovery({ token: p.get("access_token") ?? undefined });
      window.location.replace(`/${locale}/reset-password`); // drops the fragment from the address bar
      return;
    }
    window.location.replace(`/${locale}/auth/callback${hash}`);
  }, [locale]);

  return null;
}
