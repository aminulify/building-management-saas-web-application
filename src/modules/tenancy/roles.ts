import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { AREA_BASE } from "@/shared/areas";

/**
 * The person's role changed: every link already saved in their notifications moves into their new area, so a click never
 * lands on a page that belongs to someone else's role (/tenant-free → /tenant → /home-owner and back).
 */
export async function retargetLinks(tx: Prisma.TransactionClient, userId: string, role: "OWNER" | "TENANT" | "GENERAL_USER") {
  const base: string = AREA_BASE[role];
  await tx.$executeRaw`UPDATE "Notification" SET "link" = ${base}::text || regexp_replace("link", '^/(home-owner|tenant-free|tenant)', '') WHERE "userId" = ${userId}::uuid AND "link" ~ '^/(home-owner|tenant-free|tenant)(/|$)' AND NOT ("link" ~ ('^' || ${base}::text || '(/|$)'))`;
  // the one tenant page an owner does not have
  if (role === "OWNER") await tx.$executeRaw`UPDATE "Notification" SET "link" = '/home-owner/dashboard' WHERE "userId" = ${userId}::uuid AND "link" ~ '^/home-owner/history(/|$|[?])'`;
}

/**
 * A verified tenant is a person with an ACTIVE tenancy. When the last one ends (the tenant left, or the owner removed
 * them) the account goes back to Tenant-Free (GENERAL_USER) in the same transaction: the Subscription tab returns and
 * nothing is deleted (past stays, rent records, repair requests, messages and saved homes all stay with the person).
 * Owners and admins never change. Returns true when the role was changed.
 */
export async function revertToTenantFree(tx: Prisma.TransactionClient, tenantId: string, actor: Actor, req?: Request): Promise<boolean> {
  const u = await tx.user.findUnique({ where: { id: tenantId }, select: { role: true } });
  if (u?.role !== "TENANT") return false;
  if ((await tx.rentalAgreement.count({ where: { tenantId, status: "ACTIVE" } })) > 0) return false;
  await tx.user.update({ where: { id: tenantId }, data: { role: "GENERAL_USER" } });
  await retargetLinks(tx, tenantId, "GENERAL_USER");
  await notify([tenantId], { type: "account.tenant_free", titleKey: "notifications.tenantFree", link: "/tenant-free/dashboard" }, tx);
  await writeAudit({ actor, action: "user.role_revert", resourceType: "User", resourceId: tenantId, before: { role: "TENANT" }, after: { role: "GENERAL_USER" }, req }, tx);
  return true;
}
