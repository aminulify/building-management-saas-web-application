import { Archive, Building2, Home, MessageCircle, Search, Siren, Store, UserCheck, UserMinus, UsersRound, UserX, Wrench, type LucideIcon } from "lucide-react";

export interface GovNavItem { key: string; href: string; icon: LucideIcon }

/** Sidebar order from the design: the working lists, a divider, then messages, the archives, Find People and Quick Alert. Pages are built one at a time. */
export const GOV_NAV: GovNavItem[][] = [
  [
    { key: "properties", href: "/gov/properties", icon: Building2 },
    { key: "manageHome", href: "/gov/manage-home", icon: Home },
    { key: "manageMarketplace", href: "/gov/manage-marketplace", icon: Store },
    { key: "activeMaintenance", href: "/gov/active-maintenance", icon: Wrench },
    { key: "activeOwners", href: "/gov/active-owners", icon: UsersRound },
    { key: "activeTenants", href: "/gov/active-tenants", icon: UserCheck },
  ],
  [
    { key: "messages", href: "/gov/messages", icon: MessageCircle },
    { key: "previousProperties", href: "/gov/previous-properties", icon: Archive },
    { key: "previousOwners", href: "/gov/previous-owners", icon: UserMinus },
    { key: "previousTenants", href: "/gov/previous-tenants", icon: UserX },
    { key: "findPeople", href: "/gov/find-people", icon: Search },
    { key: "quickAlert", href: "/gov/quick-alert", icon: Siren },
  ],
];

