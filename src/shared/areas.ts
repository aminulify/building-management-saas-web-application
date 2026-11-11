/**
 * One source of truth for "which part of the site belongs to which account". The URL always follows the role:
 *   Tenant-Free account (GENERAL_USER) → /tenant-free/…
 *   Verified Tenant (TENANT)           → /tenant/…
 *   Apartment Owner (OWNER)            → /home-owner/…
 * Used by the sign-in redirect, the page guards, and every notification link the server writes.
 */
export const AREA_BASE = { OWNER: "/home-owner", TENANT: "/tenant", GENERAL_USER: "/tenant-free" } as const;
export type AreaRole = keyof typeof AREA_BASE;
export type AreaBase = (typeof AREA_BASE)[AreaRole];

/** The base path of a role's area, or null for roles that live elsewhere (admins). */
export const baseOf = (role: string | undefined | null): AreaBase | null => (role && role in AREA_BASE ? AREA_BASE[role as AreaRole] : null);

/** Which area a path belongs to; the language prefix ("/en", "/bn") is ignored. */
export function areaOfPath(path: string): AreaBase | null {
  const m = /^(?:\/(?:en|bn))?(\/home-owner|\/tenant-free|\/tenant)(?:\/|$|\?)/.exec(path);
  return (m?.[1] as AreaBase | undefined) ?? null;
}

/** The same page in another area: "/tenant/history" → "/tenant-free/history". Anything else is returned unchanged. */
export function moveToArea(path: string, base: AreaBase): string {
  const m = /^(\/(?:en|bn))?\/(?:home-owner|tenant-free|tenant)(\/.*|\?.*)?$/.exec(path);
  return m ? `${m[1] ?? ""}${base}${m[2] ?? ""}` : path;
}

/** Pages that exist only in one area (a verified tenant has no Subscription, an owner has no Dashboard of a tenant…). */
export const ONLY_TENANT_FREE = ["/subscription"] as const;

/** Where a role's own pages begin. */
export const landingOf = (role: string | undefined | null): string => `${baseOf(role) ?? "/account"}${baseOf(role) ? "/dashboard" : ""}`;
