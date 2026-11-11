import { Bell, Building2, DollarSign, Home, LayoutDashboard, Store, MessageCircle, UserMinus, UsersRound, Wrench, BarChart3, Box, type LucideIcon } from "lucide-react";

export interface NavItem { key: string; href: string; icon: LucideIcon; badge?: "notifications" }

/** Sidebar order from the design: main group, divider, second group. Pages are built one module at a time. */
export const OWNER_NAV: NavItem[][] = [
  [
    { key: "dashboard", href: "/home-owner/dashboard", icon: LayoutDashboard },
    { key: "properties", href: "/home-owner/properties", icon: Building2 },
    { key: "units", href: "/home-owner/units", icon: Box },
    { key: "tenants", href: "/home-owner/tenants", icon: UsersRound },
    { key: "rent", href: "/home-owner/rent", icon: BarChart3 },
    { key: "findHome", href: "/home-owner/find-home", icon: Home },
    { key: "marketplace", href: "/home-owner/marketplace", icon: Store },
    { key: "subscriptions", href: "/home-owner/subscription", icon: DollarSign },
  ],
  [
    { key: "maintenance", href: "/home-owner/maintenance", icon: Wrench },
    { key: "notifications", href: "/home-owner/notifications", icon: Bell, badge: "notifications" },
    { key: "messages", href: "/home-owner/messages", icon: MessageCircle },
    { key: "previousTenants", href: "/home-owner/previous-tenants", icon: UserMinus },
  ],
];
