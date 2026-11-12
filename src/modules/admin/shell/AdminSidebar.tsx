"use client";

import { MessageNavBadge, useAcknowledge } from "@/modules/messaging/ui/MessageNavBadge";

import { LogOut } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/layout/Logo";
import { Link, usePathname } from "@/i18n/navigation";
import { useAdmin } from "./AdminContext";
import { ADMIN_NAV } from "./nav";

interface Props {
  onNavigate?: () => void;
  onLogout: () => void;
  loggingOut: boolean;
  /** tablet: icon-only rail (labels stay available to screen readers and as tooltips) */
  compact?: boolean;
}

export function AdminSidebar({ onNavigate, onLogout, loggingOut, compact = false }: Props) {
  const t = useTranslations("admin.nav");
  const ta = useTranslations("admin");
  const pathname = usePathname();
  const acknowledge = useAcknowledge();
  const me = useAdmin();
  const label = compact ? "sr-only" : "";

  return (
    <nav aria-label={ta("navLabel")} className="flex h-full flex-col">
      <div className={clsx("px-2 pb-4 pt-1", compact && "flex justify-center px-0")}>
        {compact ? <Link href="/" aria-label="AmaderGhor"><img src="/images/logo-icon.png" alt="AmaderGhor" className="size-9 object-contain" /></Link> : <Logo height={36} href="/" />}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin]">
        {ADMIN_NAV.map((group, gi) => (
          <div key={gi} className={clsx("space-y-1", gi > 0 && "mt-3 border-t border-slate-300/60 pt-3")}>
            {group.map(({ key, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={key} href={href as never} onClick={() => { if (key === "messages") acknowledge(); onNavigate?.(); }} title={compact ? t(key) : undefined}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[0.95rem] font-medium transition-all duration-300",
                    compact && "justify-center px-0",
                    active
                      ? "border-[#0A84F0] bg-sky-100/80 text-[#0A84F0] shadow-[0_6px_18px_-10px_rgba(10,132,240,0.6)]"
                      : "border-transparent text-navy hover:bg-white/60 hover:text-[#0A84F0]",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={label}>{t(key)}</span>
                  {key === "messages" && <MessageNavBadge compact={compact} />}
                </Link>
              );
            })}
          </div>
        ))}

        <button
          type="button" onClick={onLogout} disabled={loggingOut} title={compact ? t("logout") : undefined}
          className={clsx("mt-1 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[0.95rem] font-medium text-red-600 transition-colors duration-300 hover:bg-red-50/80 disabled:opacity-60", compact && "justify-center px-0")}
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          <span className={label}>{loggingOut ? t("loggingOut") : t("logout")}</span>
        </button>
      </div>

      <div title={compact ? me.username : undefined} className={clsx("mt-4 flex items-center gap-3 rounded-xl border border-white/70 bg-white/50 p-2.5 backdrop-blur-sm", compact && "justify-center p-1.5")}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white bg-white shadow-sm"><img src="/images/logo-icon.png" alt="" className="size-7 object-contain" /></span>
        <div className={clsx("min-w-0", compact && "sr-only")}>
          <p className="truncate font-bold leading-tight text-navy">{me.username}</p>
          <p className="text-xs text-label">{ta("roleAdmin")}</p>
        </div>
      </div>
    </nav>
  );
}
