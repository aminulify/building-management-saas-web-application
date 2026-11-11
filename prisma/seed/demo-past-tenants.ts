/**
 * Past tenants for the demo owner, so the Previous Tenants page has real rows to show.
 *   npm run db:seed:past            add ten finished tenancies (skips if they exist)
 *   npm run db:seed:past -- --clear remove them again
 * They are ordinary database rows: ended agreements with a month-by-month rent history. Run `db:seed:demo` first.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, type LeaveReason, type TenantBehavior } from "@prisma/client";

const db = new PrismaClient();
const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

interface Past { name: string; prop: number; start: Date; end: Date; reason: LeaveReason; behavior: TenantBehavior | null; late: number; missed: number; notes: string | null }

const PAST: Past[] = [
  { name: "Rahim Uddin", prop: 0, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "JOB_TRANSFER", behavior: "GOOD", late: 0, missed: 0, notes: "Always polite. Returned the keys on time." },
  { name: "Uddin Chowdhury", prop: 1, start: d(2022, 10, 2), end: d(2025, 0, 30), reason: "PURCHASED_HOME", behavior: "AVERAGE", late: 5, missed: 0, notes: null },
  { name: "Kamal Hossain Chowdhury", prop: 2, start: d(2022, 1, 2), end: d(2023, 0, 30), reason: "UPGRADED_UNIT", behavior: "UGLY", late: 6, missed: 1, notes: "Noise complaints from neighbours." },
  { name: "Shirin Akter", prop: 0, start: d(2024, 10, 2), end: d(2025, 0, 30), reason: "LEASE_EXPIRED", behavior: "EXCELLENT", late: 0, missed: 0, notes: "Best tenant so far. Would rent again." },
  { name: "Jahid Karim", prop: 3, start: d(2023, 6, 2), end: d(2024, 5, 30), reason: "OTHER", behavior: "VERY_BAD", late: 5, missed: 3, notes: "Damaged the kitchen cabinets and left unpaid rent." },
  { name: "Mitu Rahman", prop: 2, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "JOB_TRANSFER", behavior: "GOOD", late: 1, missed: 0, notes: null },
  { name: "Kddin Chowdhury", prop: 1, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "PURCHASED_HOME", behavior: "UGLY", late: 2, missed: 1, notes: null },
  { name: "Nasrin Sultana", prop: 3, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "UPGRADED_UNIT", behavior: "AVERAGE", late: 1, missed: 0, notes: null },
  { name: "Tanvir Ahmed", prop: 0, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "LEASE_EXPIRED", behavior: "AVERAGE", late: 1, missed: 0, notes: null },
  { name: "Aminul Islam", prop: 1, start: d(2023, 10, 2), end: d(2024, 0, 30), reason: "OTHER", behavior: null, late: 0, missed: 0, notes: null },
];

async function clear() {
  const users = await db.user.findMany({ where: { username: { startsWith: "demo_p" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const agreements = (await db.rentalAgreement.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })).map((a) => a.id);
  const records = (await db.rentRecord.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((r) => r.id);
  await db.rentPayment.deleteMany({ where: { rentRecordId: { in: records } } });
  await db.rentRecord.deleteMany({ where: { id: { in: records } } });
  await db.rentalAgreement.deleteMany({ where: { id: { in: agreements } } });
  await db.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} past tenants.`);
}

async function main() {
  if (process.argv.includes("--clear")) return clear();
  if ((await db.user.count({ where: { username: { startsWith: "demo_p" } } })) > 0) { console.log("Past tenants already exist. Use --clear to remove them."); return; }
  const owner = await db.user.findUnique({ where: { username: "demo_owner" } });
  if (!owner) throw new Error("Demo owner not found: run `npm run db:seed:demo` first.");
  const props = await db.property.findMany({ where: { ownerId: owner.id }, orderBy: { createdAt: "asc" }, include: { units: { orderBy: { unitNumber: "asc" }, take: 6 } } });
  if (props.length === 0) throw new Error("The demo owner has no properties.");

  let ref = 0;
  for (const [i, p] of PAST.entries()) {
    const prop = props[p.prop % props.length]!;
    const unit = prop.units[i % prop.units.length]!;
    const user = await db.user.create({
      data: { username: `demo_p${i + 1}`, fullName: p.name, email: `demo.past${i + 1}@example.com`, phone: `0175${String(i + 1).padStart(7, "0")}`, role: "TENANT", verificationStatus: "VERIFIED", nidLast4: String(4000 + i * 137).slice(-4), occupation: "Service holder" },
    });
    const a = await db.rentalAgreement.create({
      data: { unitId: unit.id, tenantId: user.id, ownerId: owner.id, rent: unit.rent, deposit: unit.deposit, startDate: p.start, endDate: p.end, status: "ENDED", members: 1 + (i % 4), leaveReason: p.reason, behavior: p.behavior, ownerNotes: p.notes },
    });

    // one rent record per month of the stay; the last `missed` months stay unpaid, `late` months are paid after the due date
    const months: Date[] = [];
    for (let m = new Date(Date.UTC(p.start.getUTCFullYear(), p.start.getUTCMonth(), 1)); m <= p.end; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(m);
    for (const [k, month] of months.entries()) {
      const rent = Number(unit.rent);
      const missed = k >= months.length - p.missed;
      const late = !missed && k < p.late;
      const due = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 5));
      const rec = await db.rentRecord.create({
        data: { agreementId: a.id, billingMonth: month, rent, total: rent, paid: missed ? 0 : rent, dueDate: due, status: missed ? "DUE" : "PAID" },
      });
      if (!missed) {
        await db.rentPayment.create({
          data: { rentRecordId: rec.id, amount: rent, method: k % 2 ? "CASH" : "BKASH", reference: k % 2 ? null : `PAST${String(++ref).padStart(6, "0")}`, paidAt: new Date(due.getTime() + (late ? (4 + (k % 9)) * 86_400_000 : -((k % 3) + 1) * 86_400_000)), recordedById: owner.id, status: "VERIFIED" },
        });
      }
    }
  }
  console.log(`Added ${PAST.length} past tenants to the demo owner.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
