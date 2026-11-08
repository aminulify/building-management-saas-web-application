import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Actor } from "./auth/require-actor";

interface AuditInput {
  actor: Actor;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  req?: Request;
}

/** Append-only. Pass `tx` to write inside the caller's transaction. */
export async function writeAudit(input: AuditInput, tx: Prisma.TransactionClient = db) {
  await tx.auditLog.create({
    data: {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      before: input.before,
      after: input.after,
      ip: input.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: input.req?.headers.get("user-agent") ?? undefined,
    },
  });
}
