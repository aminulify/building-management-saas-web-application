"use client";

import { createContext, useContext } from "react";
import { baseOf } from "@/shared/areas";

export interface TenantMe { id: string; username: string; fullName: string; phone: string | null; role: string; status: string; avatarUrl?: string | null }
export interface TenantCtx { me: TenantMe; unread: number; refreshUnread: () => void; setUnread: (n: number) => void; /** look at the role again now (a payment was approved, a tenancy started or ended) */ refreshMe: () => void; /** the profile page tells the sidebar the new name or picture at once */ updateMe: (patch: Partial<TenantMe>) => void }

const Ctx = createContext<TenantCtx | null>(null);
export const TenantProvider = Ctx.Provider;
/** read without throwing, for pages that also live in other areas (Find Home, Marketplace) */
export const TenantContext = Ctx;

/** The URL base of the signed-in person's area: /tenant for a verified tenant, /tenant-free for a Tenant-Free account. */
export function useTenantBase(): string {
  const v = useContext(Ctx);
  return baseOf(v?.me.role) ?? "/tenant";
}

export function useTenant(): TenantCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant must be used inside <TenantShell>");
  return v;
}
