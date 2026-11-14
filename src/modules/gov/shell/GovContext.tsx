"use client";

import { createContext, useContext } from "react";

export interface GovMe { id: string; username: string; fullName: string; email?: string | null; role: string }
export interface GovValue { me: GovMe; openAlerts: number }

const Ctx = createContext<GovValue | null>(null);
export const GovProvider = Ctx.Provider;

export function useGov(): GovValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGov must be used inside <GovShell>");
  return v;
}
