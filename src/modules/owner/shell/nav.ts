import { Bell, Building2, DollarSign, Home, LayoutDashboard, Store, MessageCircle, UserMinus, UsersRound, Wrench, BarChart3, Box, type LucideIcon } from "lucide-react";

export interface NavItem { key: string; href: string; icon: LucideIcon; badge?: "notifications" }

/** Sidebar order from the design: main group, divider, second group. Pages are built one module at a time. */
export const OWNER_NAV: NavItem[][] = [
  [
    { key: "dashboard", href: "/owner/dashboard", icon: LayoutDashboard },
    { key: "properties", href: "/owner/properties", icon: Building2 },
    { key: "units", href: "/owner/units", icon: Box },
    { key: "tenants", href: "/owner/tenants", icon: UsersRound },
    { key: "rent", href: "/owner/rent", icon: BarChart3 },
    { key: "findHome", href: "/owner/find-home", icon: Home },
    { key: "marketplace", href: "/owner/marketplace", icon: Store },
    { key: "subscriptions", href: "/owner/subscription", icon: DollarSign },
  ],
  [
    { key: "maintenance", href: "/owner/maintenance", icon: Wrench },
    { key: "notifications", href: "/owner/notifications", icon: Bell, badge: "notifications" },
    { key: "messages", href: "/owner/messages", icon: MessageCircle },
    { key: "previousTenants", href: "/owner/previous-tenants", icon: UserMinus },
  ],
];
