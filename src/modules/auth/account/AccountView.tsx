"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { GradientButton } from "@/components/glass/GradientButton";
import { StatusBadge } from "@/components/glass/StatusBadge";
import { hl } from "@/components/typography/highlight";
import { FadeIn } from "@/components/motion/FadeIn";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi, clearSession, getSession, homeFor } from "@/lib/auth-client";

interface Me {
  id: string; username: string; fullName: string; email: string | null; role: string; status: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; ownerCode: string | null;
}

const VERIFY_TONE = { VERIFIED: "success", PENDING: "warning", UNVERIFIED: "danger", REJECTED: "danger" } as const;

/** Signed-in landing page until the role dashboards exist. Guarded: no session → sign-in page (and back here after). */
export function AccountView() {
  const t = useTranslations("account");
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!getSession()) { router.replace("/login?next=/account" as never); return; }
    setState("loading");
    try {
      const profile = await authApi<Me>("/me");
      if (profile.role === "SUPER_ADMIN" || profile.role === "OWNER" || profile.role === "TENANT" || profile.role === "GENERAL_USER") { router.replace(homeFor(profile.role) as never); return; } // these roles have their own area
      setMe(profile);
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { clearSession(); router.replace("/login?next=/account" as never); return; }
      setState("error");
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    setSigningOut(true);
    try { await authApi("/auth/logout", { method: "POST" }); } catch { /* the local session is cleared either way */ }
    clearSession();
    router.replace("/login" as never);
  }

  if (state === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
        <div className="flex items-center gap-4"><div className="skeleton size-16 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-5 w-2/3" /><div className="skeleton h-4 w-1/3" /></div></div>
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  if (state === "error" || !me) {
    return (
      <div role="alert" className="text-center">
        <p className="mx-auto flex max-w-sm items-start justify-center gap-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t("loadError")}</p>
        <GradientButton className="mt-6" onClick={() => void load()}><RefreshCw className="size-4" aria-hidden />{t("retry")}</GradientButton>
      </div>
    );
  }

  const initials = me.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <FadeIn>
      <h1 className="text-[1.75rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
      <div className="mt-6 flex items-center gap-4">
        <div className="bg-brand-gradient grid size-16 shrink-0 place-items-center rounded-full text-xl font-bold text-white shadow-lg" aria-hidden>{initials}</div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-navy">{me.fullName}</p>
          <p className="truncate text-sm text-slate-600">@{me.username}{me.email ? ` · ${me.email}` : ""}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 rounded-2xl border border-white/60 bg-white/50 p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-bold uppercase tracking-wider text-label">{t("role")}</dt><dd className="mt-1"><StatusBadge tone="vip">{t(`roles.${me.role}`)}</StatusBadge></dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wider text-label">{t("verification")}</dt><dd className="mt-1"><StatusBadge tone={VERIFY_TONE[me.verificationStatus]}>{t(`verifications.${me.verificationStatus}`)}</StatusBadge></dd></div>
        {me.ownerCode && <div><dt className="text-xs font-bold uppercase tracking-wider text-label">{t("ownerId")}</dt><dd className="mt-1 font-semibold text-navy">{me.ownerCode}</dd></div>}
      </dl>

      <p className="mt-5 text-sm text-slate-600">{t("note")}</p>
      <GradientButton variant="glass" className="mt-6" loading={signingOut} onClick={() => void signOut()}><LogOut className="size-4" aria-hidden />{t("signOut")}</GradientButton>
    </FadeIn>
  );
}
