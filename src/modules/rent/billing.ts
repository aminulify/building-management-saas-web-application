import { Prisma, type RentStatus } from "@prisma/client";

export const DUE_DAY = 10;

/** First day of the month (UTC) from a date or "YYYY-MM". */
export function monthStart(input: Date | string = new Date()): Date {
  if (typeof input === "string") {
    const [y, m] = input.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, 1));
  }
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
}

export const dueDateFor = (month: Date) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), DUE_DAY));

export function computeStatus(total: Prisma.Decimal, paid: Prisma.Decimal, dueDate: Date, now = new Date()): RentStatus {
  if (paid.gte(total)) return "PAID";
  if (now > dueDate) return "OVERDUE";
  return paid.gt(0) ? "PARTIAL" : "DUE";
}

/** Idempotent: unique (agreementId, billingMonth) + skipDuplicates. */
export async function ensureRentRecords(
  tx: Prisma.TransactionClient,
  agreements: { id: string; rent: Prisma.Decimal; unit: { utilityCharge: Prisma.Decimal } }[],
  month: Date,
) {
  if (agreements.length === 0) return 0;
  const { count } = await tx.rentRecord.createMany({
    data: agreements.map((a) => ({
      agreementId: a.id,
      billingMonth: month,
      rent: a.rent,
      utility: a.unit.utilityCharge,
      total: a.rent.plus(a.unit.utilityCharge),
      dueDate: dueDateFor(month),
    })),
    skipDuplicates: true,
  });
  return count;
}
