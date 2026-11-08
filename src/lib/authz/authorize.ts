import { db } from "../db";
import { AppError } from "../errors";
import type { Actor } from "../auth/require-actor";
import { scopeFor, type Permission } from "@/shared/permissions";

export interface ResourceCtx {
  /** User id that owns the target resource (for `own` scope). */
  ownerId?: string;
  /** User id the resource is assigned to (for `assigned` scope). */
  assigneeId?: string;
  /** Tenant id of the target agreement (for tenant `assigned` scope). */
  tenantId?: string;
  /** Request is read-only; permits `read` scope. */
  readOnly?: boolean;
}

/**
 * Role permission AND resource scope. Throws FORBIDDEN.
 * `entitlement` scope passes here and must be followed by assertEntitlement().
 */
export async function authorize(actor: Actor, permission: Permission, ctx: ResourceCtx = {}): Promise<void> {
  const override = await db.userPermissionOverride.findUnique({
    where: { userId_permission: { userId: actor.id, permission } },
  });
  if (override && !override.granted) throw new AppError("FORBIDDEN", { permission });

  const scope = scopeFor(actor.role, permission);
  const allowed = (() => {
    switch (scope) {
      case "all":
      case "entitlement":
        return true;
      case "own":
        return ctx.ownerId === actor.id;
      case "assigned":
        return ctx.assigneeId === actor.id || ctx.tenantId === actor.id;
      case "read":
        return ctx.readOnly === true;
      case "grantable":
        return override?.granted === true;
      default:
        return override?.granted === true; // an explicit grant can open a denied permission
    }
  })();

  if (!allowed) throw new AppError("FORBIDDEN", { permission });
}

/** Coarse role gate for routes where no resource scope applies. */
export function requireRole(actor: Actor, ...roles: Actor["role"][]): void {
  if (!roles.includes(actor.role)) throw new AppError("FORBIDDEN", { roles });
}
