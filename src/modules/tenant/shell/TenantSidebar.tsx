"use client";

import { LogOut } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/layout/Logo";
import { Link, usePathname } from "@/i18n/navigation";
import { baseOf } from "@/shared/areas";
import { FreePlanCard } from "./FreePlanCard";
import { navFor, showsFreePlanCard } from "./nav";
import { useTenant } from "./TenantContext";

interface Props { onNavigate?: () => void; onLogout: () => void; loggingOut: boolean; /** tablet: icon-only rail */ compact?: boolean }

export function TenantSidebar({ onNavigate, onLogout, loggingOut, compact = false }: Props) {
  const t = useTranslations("tenant.nav");
  const to = useTranslations("tenant");
  const pathname = usePathname();
  const { me, unread } = useTenant();
  const label = compact ? "sr-only" : "";
  const base = baseOf(me.role) ?? "/tenant";
  const onProfile = pathname === `${base}/profile`;
  const initials = me.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <nav aria-label={to("navLabel")} className="flex h-full flex-col">
      <div className={clsx("px-2 pb-4 pt-1", compact && "flex justify-center px-0")}>
        {compact ? <Link href="/" aria-label="AmaderGhor"><img src="/images/logo-icon.png" alt="AmaderGhor" className="size-9 object-contain" /></Link> : <Logo height={36} href="/" />}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-0.5">
        {navFor(me.role).map((group, gi) => (
          <div key={gi} className={clsx("space-y-1", gi > 0 && "mt-3 border-t border-slate-300/60 pt-3")}>
            {group.map(({ key, href, icon: Icon, badge }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={key} href={href as never} onClick={onNavigate} title={compact ? t(key) : undefined} aria-current={active ? "page" : undefined}
                  className={clsx("group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[0.95rem] font-medium transition-all duration-300", compact && "justify-center px-0",
                    active ? "border-[#0A84F0] bg-white/90 text-[#0A84F0] shadow-[0_6px_18px_-10px_rgba(10,132,240,0.6)]" : "border-transparent text-navy hover:bg-white/60 hover:text-[#0A84F0]")}>
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={label}>{t(key)}</span>
                  {badge === "notifications" && unread > 0 && (
                    <span className={clsx("size-2 shrink-0 rounded-full bg-red-500", compact ? "absolute right-3 top-2.5" : "ml-0.5")}><span className="sr-only">{to("unread", { count: unread })}</span></span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <button type="button" onClick={onLogout} disabled={loggingOut} title={compact ? t("logout") : undefined}
          className={clsx("mt-1 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[0.95rem] font-medium text-red-600 transition-colors duration-300 hover:bg-red-50/80 disabled:opacity-60", compact && "justify-center px-0")}>
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className={label}>{loggingOut ? t("loggingOut") : t("logout")}</span>
        </button>
      </div>

      {showsFreePlanCard(me.role) && <FreePlanCard compact={compact} onNavigate={onNavigate} />}

      <Link href={`${base}/profile` as never} onClick={onNavigate} title={compact ? me.username : undefined} aria-current={onProfile ? "page" : undefined}
        className={clsx("mt-4 flex items-center gap-3 rounded-xl border p-2.5 backdrop-blur-sm transition-all duration-300", compact && "justify-center p-1.5",
          onProfile ? "border-[#0A84F0] bg-white/90 shadow-[0_6px_18px_-10px_rgba(10,132,240,0.6)]" : "border-white/70 bg-white/50 hover:bg-white/80")}>
        {me.avatarUrl
          ? <img src={me.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          : <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{initials || "?"}</span>}
        <div className={clsx("min-w-0", compact && "sr-only")}>
          <p className="truncate font-bold leading-tight text-navy">{me.username}</p>
          <p className="text-xs text-label">{to(me.role === "GENERAL_USER" ? "roleUser" : "roleTenant")}</p>
        </div>
      </Link>
    </nav>
  );
}
