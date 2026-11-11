"use client";

import { createContext, useContext } from "react";

export interface OwnerMe { id: string; username: string; fullName: string; phone: string | null; role: string; status: string; avatarUrl?: string | null }
export interface OwnerCtx { me: OwnerMe; unread: number; refreshUnread: () => void; /** the Notification Center tells the sidebar badge the new number at once */ setUnread: (n: number) => void; /** the profile page tells the sidebar the new name or picture at once */ updateMe: (patch: Partial<OwnerMe>) => void }

const Ctx = createContext<OwnerCtx | null>(null);
export const OwnerProvider = Ctx.Provider;

export function useOwner(): OwnerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOwner must be used inside <OwnerShell>");
  return v;
}
