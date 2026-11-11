export const ROLES = ["SUPER_ADMIN", "GOV_ADMIN", "OWNER", "TENANT", "GENERAL_USER"] as const;
export type RoleName = (typeof ROLES)[number];

/**
 * Everyone who signs up starts as a GENERAL_USER (the "Tenant-Free" account). They become a TENANT only when an owner invites
 * or connects them, and an OWNER when a plan is bought and approved. Admin accounts are created by a Super Admin or the seed script.
 */
export const PUBLIC_REGISTRATION_ROLES = ["GENERAL_USER"] as const;

export const isRole = (v: unknown): v is RoleName =>
  typeof v === "string" && (ROLES as readonly string[]).includes(v);
