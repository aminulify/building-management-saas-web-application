import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { money } from "@/lib/api/common";
import type { Actor } from "@/lib/auth/require-actor";
import { receiptNumber, rentContext } from "./service";

export const tenantPaySchema = z.object({
  method: z.enum(["BKASH", "NAGAD", "ROCKET", "BANK"]),
  /** TrxID / bank reference: required so the owner can check it and duplicates are refused */
  reference: z.string().trim().min(4).max(40),
  /** defaults to everything still owed */
  amount: money.optional(),
});

/**
 * "Send Paid Request": the tenant says they paid this month's rent by bKash / Nagad / Rocket / bank. It is stored as a PENDING
 * payment (it does not reduce the balance) and the owner is told; the owner confirms it from Rent Overview.
 */
export async function reportPayment(actor: Actor, recordId: string, input: z.infer<typeof tenantPaySchema>, req: Request) {
  await authorize(actor, "rent:pay", { ownerId: actor.id });
  rateLimit(`pay-report:${actor.id}`, 8, 3600_000);
  const rec = await db.rentRecord.findUnique({ where: { id: recordId }, include: { agreement: { select: { tenantId: true, ownerId: true, status: true } } } });
  if (!rec || rec.agreement.tenantId !== actor.id) throw new AppError("NOT_FOUND");
  if (rec.agreement.status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "not_active" });

  const owed = rec.total.minus(rec.paid);
  if (owed.lte(0)) throw new AppError("INVALID_STATE", { reason: "already_paid" });
  const amount = new Prisma.Decimal(input.amount ?? owed.toFixed(2));
  if (amount.gt(owed)) throw new AppError("VALIDATION_ERROR", [{ path: "amount", code: "exceeds_balance", max: owed.toFixed(2) }]);
  if ((await db.rentPayment.count({ where: { rentRecordId: recordId, status: "PENDING", recordedById: actor.id } })) > 0) throw new AppError("INVALID_STATE", { reason: "already_pending" });

  try {
    return await db.$transaction(async (tx) => {
      const payment = await tx.rentPayment.create({
        data: { rentRecordId: recordId, amount, method: input.method, reference: input.reference.toUpperCase(), paidAt: new Date(), recordedById: actor.id, status: "PENDING" },
        select: { id: true, amount: true, method: true, status: true, paidAt: true },
      });
      const ctx = await rentContext(tx, recordId);
      await notify([rec.agreement.ownerId], {
        type: "rent.received", titleKey: "notifications.rentReceived", link: "/home-owner/rent", priority: "HIGH",
        params: { tenantName: ctx.tenantName, unit: ctx.unit, property: ctx.property, amount: amount.toFixed(2), method: input.method, receipt: receiptNumber(payment.id, ctx.billingMonth), paymentId: payment.id, verified: false },
      }, tx);
      await writeAudit({ actor, action: "rent.payment_reported", resourceType: "RentPayment", resourceId: payment.id, after: { recordId, amount: amount.toFixed(2), method: input.method }, req }, tx);
      return payment;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", { field: "reference" });
    throw e;
  }
}
