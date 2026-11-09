"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

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
    window.location.replace(`/${locale}/auth/callback${hash}`);
  }, [locale]);

  return null;
}
