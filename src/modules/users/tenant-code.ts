import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** "TF100001": the next Tenant ID (a database sequence, so two sign-ups never share one). */
export async function nextTenantCode(tx: Prisma.TransactionClient | typeof db = db): Promise<string> {
  const [{ n }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('tenant_code_seq')::text AS n`;
  return `TF${n}`;
}

/** The person's Tenant ID, given now if the account does not have one yet (accounts made before the ID existed). */
export async function ensureTenantCode(userId: string): Promise<string> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tenantCode: true } });
  if (u.tenantCode) return u.tenantCode;
  const code = await nextTenantCode();
  const r = await db.user.updateMany({ where: { id: userId, tenantCode: null }, data: { tenantCode: code } });
  if (r.count === 1) return code;
  return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tenantCode: true } })).tenantCode!; // another request won the race
}
