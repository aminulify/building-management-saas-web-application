"use client";

import { createContext, useContext } from "react";

export interface AdminMe { id: string; username: string; fullName: string; email?: string | null; role: string }

const Ctx = createContext<AdminMe | null>(null);
export const AdminProvider = Ctx.Provider;

export function useAdmin(): AdminMe {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin must be used inside <AdminShell>");
  return v;
}
