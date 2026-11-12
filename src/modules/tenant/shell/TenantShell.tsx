"use client";

import { MessagingProvider } from "@/modules/messaging/ui/MessagingProvider";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Menu, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { GlassCard } from "@/components/glass/GlassCard";
import { GradientButton } from "@/components/glass/GradientButton";
import { ToastProvider } from "@/components/feedback/Toast";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { Logo } from "@/components/layout/Logo";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { AFTER_LOGOUT_PATH, authApi, clearSession, getSession, homeFor } from "@/lib/auth-client";
import { TenantProvider, type TenantMe } from "./TenantContext";
import { LogoutModal } from "@/modules/owner/shell/LogoutModal";
import { baseOf, moveToArea } from "@/shared/areas";
import { canOpen, landingFor } from "./nav";
import { TenantSidebar } from "./TenantSidebar";

type Phase = "checking" | "ready" | "error";

/**
 * Frame of every page in the tenant area. Role guard: no session → sign-in (and back here afterwards); a TENANT or a
 * newly registered GENERAL_USER stays (each with their own pages and sidebar); any other role → its own home.
 * The role is looked at again every minute and when the tab comes back, so a new user who becomes a verified tenant
 * (or an owner) gets the right sidebar without signing in again. The API enforces the same rules on every request.
 */
export function TenantShell({ children, area }: { children: React.ReactNode; /** the URL base this layout serves: /tenant (verified tenant) or /tenant-free (Tenant-Free account) */ area: "/tenant" | "/tenant-free" }) {
  const t = useTranslations("tenant");
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("checking");
  const [me, setMe] = useState<TenantMe | null>(null);
  const [unread, setUnread] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [askLogout, setAskLogout] = useState(false);

  const updateMe = useCallback((patch: Partial<TenantMe>) => setMe((cur) => (cur ? { ...cur, ...patch } : cur)), []);

  const refreshUnread = useCallback(() => {
    authApi<{ unread: number }>("/notifications?limit=1").then((r) => setUnread(r.unread)).catch(() => undefined);
  }, []);

  const check = useCallback(async () => {
    if (!getSession()) { router.replace(`/login?next=${encodeURIComponent(pathname)}` as never); return; }
    setPhase("checking");
    try {
      const profile = await authApi<TenantMe>("/me");
      if (profile.role !== "TENANT" && profile.role !== "GENERAL_USER") { router.replace(homeFor(profile.role) as never); return; }
      // the address always follows the role: a Tenant-Free account is sent to /tenant-free/…, a verified tenant to /tenant/…
      const base = baseOf(profile.role);
      if (base && base !== area) { router.replace(moveToArea(pathname, base) as never); return; }
      setMe(profile);
      setPhase("ready");
      refreshUnread();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { clearSession(); router.replace(`/login?next=${encodeURIComponent(pathname)}` as never); return; }
      setPhase("error");
    }
  }, [router, pathname, area, refreshUnread]);

  useEffect(() => { void check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // the role can change while the page is open (a payment is approved, a tenancy starts or ends): look again now, every minute and when the tab comes back
  const refreshMe = useCallback(() => {
    authApi<TenantMe>("/me").then((p) => {
      if (p.role !== "TENANT" && p.role !== "GENERAL_USER") { router.replace(homeFor(p.role) as never); return; }
      const base = baseOf(p.role);
      if (base && base !== area) { router.replace(moveToArea(pathname, base) as never); return; } // became a verified tenant, or went back to Tenant-Free
      setMe((cur) => (cur && cur.role !== p.role ? { ...cur, role: p.role } : cur));
    }).catch(() => undefined);
  }, [router, area, pathname]);
  useEffect(() => {
    if (phase !== "ready") return;
    const look = () => { if (!document.hidden) refreshMe(); };
    const id = setInterval(look, 60_000);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [phase, refreshMe]);

  // a page that is not part of this role's area (a new user opening My Dashboard, a tenant opening Subscription) goes to the role's own landing page
  useEffect(() => {
    if (phase === "ready" && me && !canOpen(me.role, pathname)) router.replace(landingFor(me.role) as never);
  }, [phase, me, pathname, router]);

  // mobile drawer: Escape closes it, page scroll is locked while open
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [drawer]);

  /** after the confirmation: end the session on the server, clear it here, then show the public homepage */
  async function logout() {
    setLoggingOut(true);
    try { await authApi("/auth/logout", { method: "POST" }); } catch { /* the local session is cleared either way */ }
    clearSession();
  }

  if (phase !== "ready" || !me) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <AmbientBackground />
        <GlassCard className="w-full max-w-sm p-8 text-center">
          {phase === "error" ? (
            <div role="alert">
              <AlertTriangle className="mx-auto size-9 text-red-500" aria-hidden />
              <p className="mt-3 font-semibold text-navy">{t("loadError")}</p>
              <GradientButton className="mt-5" onClick={() => void check()}><RefreshCw className="size-4" aria-hidden />{t("retry")}</GradientButton>
            </div>
          ) : (
            <div role="status" aria-busy="true" className="space-y-3"><div className="skeleton mx-auto h-8 w-40" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-2/3" /><span className="sr-only">{t("loading")}</span></div>
          )}
        </GlassCard>
      </main>
    );
  }

  return (
    <ToastProvider>
      <TenantProvider value={{ me, unread, refreshUnread, setUnread, refreshMe, updateMe }}>
        <MessagingProvider meId={me.id}>
        <AmbientBackground />
        <div className="mx-auto flex min-h-screen max-w-[1500px] gap-4 p-3 sm:p-4 lg:gap-5 lg:p-5">
          {/* desktop sidebar */}
          <aside className="glass-card sticky top-5 hidden h-[calc(100vh-2.5rem)] w-72 shrink-0 p-4 lg:block"><TenantSidebar onLogout={() => setAskLogout(true)} loggingOut={loggingOut} /></aside>
          {/* tablet icon rail */}
          <aside className="glass-card sticky top-4 hidden h-[calc(100vh-2rem)] w-[76px] shrink-0 p-2 md:block lg:hidden"><TenantSidebar compact onLogout={() => setAskLogout(true)} loggingOut={loggingOut} /></aside>

          <div className="min-w-0 flex-1">
            <header className="mb-3 flex items-center justify-between gap-3 md:hidden">
              <button type="button" onClick={() => setDrawer(true)} aria-label={t("openMenu")} aria-expanded={drawer} className="glass-card grid size-11 place-items-center rounded-xl"><Menu className="size-5 text-navy" aria-hidden /></button>
              <Logo height={30} href="/" />
              <LangSwitch />
            </header>
            <main id="main" className="glass-card min-h-[calc(100vh-2rem)] p-4 sm:p-6 lg:p-7">
              <div className="mb-5 hidden justify-end md:flex"><LangSwitch /></div>
              {canOpen(me.role, pathname) ? children : null}
            </main>
          </div>
        </div>

        <LogoutModal open={askLogout} busy={loggingOut} onCancel={() => { if (!loggingOut) setAskLogout(false); }} onConfirm={logout} onDone={() => { setDrawer(false); router.replace(AFTER_LOGOUT_PATH as never); }} />

        {/* mobile drawer */}
        <AnimatePresence>
          {drawer && (
            <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <button type="button" aria-label={t("closeMenu")} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
              <motion.aside
                role="dialog" aria-modal="true" aria-label={t("navLabel")}
                className="glass-card absolute inset-y-3 left-3 w-[19rem] max-w-[85vw] bg-white/85 p-4"
                initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.35 }}
              >
                <button type="button" onClick={() => setDrawer(false)} aria-label={t("closeMenu")} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-white/70"><X className="size-5" aria-hidden /></button>
                <TenantSidebar onNavigate={() => setDrawer(false)} onLogout={() => setAskLogout(true)} loggingOut={loggingOut} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
        </MessagingProvider>
      </TenantProvider>
    </ToastProvider>
  );
}
