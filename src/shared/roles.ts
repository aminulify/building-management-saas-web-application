export const ROLES = ["SUPER_ADMIN", "GOV_ADMIN", "OWNER", "TENANT", "GENERAL_USER"] as const;
export type RoleName = (typeof ROLES)[number];

/** Roles that may self-register publicly. Admin accounts are created by a Super Admin or the seed script. */
export const PUBLIC_REGISTRATION_ROLES = ["OWNER", "TENANT", "GENERAL_USER"] as const;

export const isRole = (v: unknown): v is RoleName =>
  typeof v === "string" && (ROLES as readonly string[]).includes(v);
