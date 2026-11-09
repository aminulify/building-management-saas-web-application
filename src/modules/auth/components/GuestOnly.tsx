"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { authApi, getSession, POST_LOGIN_PATH } from "@/lib/auth-client";

/** Role guard for public auth pages: a signed-in user is sent on to their own area instead. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getSession()) return;
    let cancelled = false;
    authApi<{ role: string }>("/me")
      .then(() => { if (!cancelled) router.replace(POST_LOGIN_PATH as never); })
      .catch(() => { /* expired or deleted account: authApi already cleared the session */ });
    return () => { cancelled = true; };
  }, [router]);

  return <>{children}</>;
}
