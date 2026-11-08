import type { RoleName } from "./roles";

/**
 * Scope of a permission for a role:
 *  all          – any row
 *  own          – only rows the actor owns (resource ownerId must equal actor.id)
 *  assigned     – rows tied to the actor's assignment / active agreement
 *  read         – read-only access
 *  entitlement  – allowed only with an active paid plan (checked by assertEntitlement)
 *  grantable    – denied unless a Super Admin granted it through UserPermissionOverride
 */
export type Scope = "all" | "own" | "assigned" | "read" | "entitlement" | "grantable";

export const PERMISSIONS = [
  "marketplace:browse", "favorite:manage", "listing:report",
  "listing:create", "listing:manage", "listing:moderate",
  "property:read", "property:manage", "unit:read", "unit:manage",
  "tenancy:read", "tenancy:manage", "rent:record", "rent:pay",
  "maintenance:create", "maintenance:manage",
  "complaint:create", "complaint:manage",
  "sos:create", "sos:respond",
  "people:search",
  "user:manage", "govadmin:manage",
  "plan:manage", "pricing:manage", "payment:refund",
  "subscription:purchase",
  "audit:read", "settings:manage", "broadcast:send",
  "upgrade:request", "upgrade:review",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

type Matrix = Record<RoleName, Partial<Record<Permission, Scope>>>;

const everyone: Partial<Record<Permission, Scope>> = {
  "marketplace:browse": "all",
  "favorite:manage": "all",
  "listing:report": "all",
};

/** Mirrors architecture.md section 4.2. */
export const PERMISSION_MATRIX: Matrix = {
  SUPER_ADMIN: {
    ...everyone,
    "listing:create": "all", "listing:manage": "all", "listing:moderate": "all",
    "property:read": "all", "property:manage": "all", "unit:read": "all", "unit:manage": "all",
    "tenancy:read": "all", "maintenance:manage": "all", "complaint:manage": "all",
    "sos:respond": "all", "people:search": "all",
    "user:manage": "all", "govadmin:manage": "all",
    "plan:manage": "all", "pricing:manage": "all", "payment:refund": "all",
    "audit:read": "all", "settings:manage": "all", "broadcast:send": "all",
    "upgrade:review": "all",
  },
  GOV_ADMIN: {
    ...everyone,
    "listing:create": "grantable", "listing:manage": "read", "listing:moderate": "read",
    "property:read": "read", "unit:read": "read", "tenancy:read": "read",
    "maintenance:manage": "read", "complaint:manage": "assigned",
    "sos:respond": "all", "people:search": "all", "audit:read": "own",
  },
  OWNER: {
    ...everyone,
    "listing:create": "entitlement", "listing:manage": "own",
    "property:read": "own", "property:manage": "own",
    "unit:read": "own", "unit:manage": "own",
    "tenancy:read": "own", "tenancy:manage": "own", "rent:record": "own",
    "maintenance:manage": "own",
    // deviation from architecture 4.2: owners can raise complaints, so they must also be able to follow their own
    "complaint:create": "all", "complaint:manage": "own", "sos:create": "all",
    "subscription:purchase": "all", "upgrade:request": "own",
  },
  TENANT: {
    ...everyone,
    "listing:create": "entitlement", "listing:manage": "own",
    "tenancy:read": "assigned", "rent:pay": "own",
    "maintenance:create": "own", "maintenance:manage": "own",
    "complaint:create": "all", "complaint:manage": "own",
    "sos:create": "all",
    "subscription:purchase": "all", "upgrade:request": "own",
  },
  GENERAL_USER: {
    ...everyone,
    "listing:create": "entitlement", "listing:manage": "own",
    "complaint:create": "all", "complaint:manage": "own",
    "subscription:purchase": "all", "upgrade:request": "own",
  },
};

export const scopeFor = (role: RoleName, permission: Permission): Scope | undefined =>
  PERMISSION_MATRIX[role][permission];
