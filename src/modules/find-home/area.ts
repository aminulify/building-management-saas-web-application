"use client";

import { useContext } from "react";
import { usePathname } from "@/i18n/navigation";
import { areaOfPath, type AreaBase } from "@/shared/areas";
import { OwnerContext } from "../owner/shell/OwnerContext";
import { TenantContext } from "../tenant/shell/TenantContext";

/** Find Home and Marketplace are shared by every signed-in area; links and redirects stay inside the area the visitor is in. */
export type Area = AreaBase; // "/home-owner" | "/tenant" | "/tenant-free"

/** The area from a path with or without the language prefix ("/en/tenant-free/marketplace", "/tenant/marketplace"). */
export const areaOf = (path: string): Area => areaOfPath(path) ?? "/home-owner";

/** For code outside React (redirects, share links). */
export const currentArea = (): Area => (typeof window === "undefined" ? "/home-owner" : areaOf(window.location.pathname));

export function useArea(): Area { return areaOf(usePathname()); }

/** The signed-in person's role, whichever shell the page sits in. */
export function useViewerRole(): string {
  const owner = useContext(OwnerContext);
  const tenant = useContext(TenantContext);
  return owner?.me.role ?? tenant?.me.role ?? "";
}

/** The signed-in person (name, phone, role), whichever shell the page sits in. */
export function useViewerMe(): { fullName: string; phone: string | null; role: string } {
  const owner = useContext(OwnerContext);
  const tenant = useContext(TenantContext);
  const me = owner?.me ?? tenant?.me;
  return { fullName: me?.fullName ?? "", phone: me?.phone ?? null, role: me?.role ?? "" };
}
