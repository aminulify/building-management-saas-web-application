import { BarChart3, Building2, DollarSign, Home, LayoutDashboard, MessageCircle, Search, Store, UserCheck, UserMinus, UsersRound, UserX, Wrench, Archive, type LucideIcon } from "lucide-react";

export interface AdminNavItem { key: string; href: string; icon: LucideIcon }

/** Sidebar order from the design: main links, a divider, then messages, previous records, Find People. Pages are built one module at a time. */
export const ADMIN_NAV: AdminNavItem[][] = [
  [
    { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { key: "properties", href: "/admin/properties", icon: Building2 },
    { key: "manageHome", href: "/admin/manage-home", icon: Home },
    { key: "manageMarketplace", href: "/admin/manage-marketplace", icon: Store },
    { key: "report", href: "/admin/report", icon: BarChart3 },
    { key: "activeMaintenance", href: "/admin/active-maintenance", icon: Wrench },
    { key: "activeOwners", href: "/admin/active-owners", icon: UsersRound },
    { key: "activeTenants", href: "/admin/active-tenants", icon: UserCheck },
    { key: "subscriptions", href: "/admin/subscriptions", icon: DollarSign },
  ],
  [
    { key: "messages", href: "/admin/messages", icon: MessageCircle },
    { key: "previousProperties", href: "/admin/previous-properties", icon: Archive },
    { key: "previousOwners", href: "/admin/previous-owners", icon: UserMinus },
    { key: "previousTenants", href: "/admin/previous-tenants", icon: UserX },
    { key: "findPeople", href: "/admin/find-people", icon: Search },
  ],
];
