import { Bell, DollarSign, Home, History, LayoutDashboard, MessageCircle, Store, Wrench, type LucideIcon } from "lucide-react";
import { areaOfPath, baseOf, landingOf, type AreaBase } from "@/shared/areas";

/** `path` is the page inside the area ("/dashboard"); `href` is the full link for the signed-in role ("/tenant-free/dashboard"). */
export interface TenantNavItem { key: string; path: string; icon: LucideIcon; badge?: "notifications" }
export interface TenantNavLink extends TenantNavItem { href: string }

/** Sidebar of the design: main group, divider, second group. Verified tenants and Tenant-Free accounts share every page. */
export const TENANT_NAV: TenantNavItem[][] = [
  [
    { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
    { key: "maintenance", path: "/maintenance", icon: Wrench },
    { key: "findHome", path: "/find-home", icon: Home },
    { key: "marketplace", path: "/marketplace", icon: Store },
    { key: "history", path: "/history", icon: History },
  ],
  [
    { key: "notifications", path: "/notifications", icon: Bell, badge: "notifications" },
    { key: "messages", path: "/messages", icon: MessageCircle },
  ],
];

/**
 * The "Tenant-Free" account (every new sign-up) sees exactly what a verified tenant sees, plus the Subscription tab.
 * Paying for a plan makes them an apartment owner; being connected to a unit by an owner makes them a verified tenant,
 * and the Subscription tab disappears.
 */
export const USER_NAV: TenantNavItem[][] = [
  [...TENANT_NAV[0]!, { key: "subscription", path: "/subscription", icon: DollarSign }],
  TENANT_NAV[1]!,
];

/** The sidebar of this role with links inside its own area (/tenant/… or /tenant-free/…). */
export function navFor(role: string): TenantNavLink[][] {
  const base = baseOf(role) ?? "/tenant";
  return (role === "GENERAL_USER" ? USER_NAV : TENANT_NAV).map((g) => g.map((i) => ({ ...i, href: `${base}${i.path}` })));
}

/** The "Free Plan" card above the profile is for Tenant-Free accounts only: a verified tenant never sees it. */
export const showsFreePlanCard = (role: string): boolean => role === "GENERAL_USER";

/** Where a person lands: the dashboard of their own area. */
export const landingFor = (role: string): string => landingOf(role);

/** May this role open this page? It must be inside the role's own area and one of the role's pages (the API checks the same on every request). */
export function canOpen(role: string, pathname: string): boolean {
  const base: AreaBase | null = baseOf(role);
  if (!base || areaOfPath(pathname) !== base) return false;
  if (pathname === `${base}/profile`) return true; // the profile page is opened from the badge at the bottom of the sidebar
  return navFor(role).flat().some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}
