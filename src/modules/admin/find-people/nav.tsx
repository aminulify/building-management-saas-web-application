"use client";

import { createContext, useContext } from "react";
import { clsx } from "clsx";

/** What a click inside a profile can open: another person, a property, a marketplace listing or one unit. */
export type NavItem = { kind: "person" | "property" | "listing" | "unit"; id: string };

const Ctx = createContext<(item: NavItem) => void>(() => undefined);
export const NavProvider = Ctx.Provider;
export const useFindNav = () => useContext(Ctx);

/** A row or word that opens another window; shows a pointer, a hover lift and a focus ring. */
export function Open({ to, label, className, children }: { to: NavItem; label: string; className?: string; children: React.ReactNode }) {
  const open = useFindNav();
  return (
    <button
      type="button" onClick={() => open(to)} aria-label={label}
      className={clsx("text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0", className)}
    >
      {children}
    </button>
  );
}

/** Same, but plain text that looks like a link (for a name inside a sentence). */
export function OpenText({ to, label, children }: { to: NavItem; label: string; children: React.ReactNode }) {
  const open = useFindNav();
  return <button type="button" onClick={() => open(to)} aria-label={label} className="rounded font-bold text-[#0A84F0] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#48BDFA]">{children}</button>;
}
