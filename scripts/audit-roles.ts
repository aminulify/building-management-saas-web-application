/**
 * Read-only audit of account roles and the records around them (Tenant-Free → Verified Tenant → Owner).
 *   npm run audit:roles           report only
 *   npm run audit:roles -- --fix  also repairs the role mismatches that have exactly one right answer
 * Exit code 1 when something is wrong. Nothing is ever deleted.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const fix = process.argv.includes("--fix");
let problems = 0;

async function check(name: string, rows: { id: string; note?: string }[], repair?: () => Promise<number>) {
  if (rows.length === 0) { console.log(`  ok    ${name}`); return; }
  problems += rows.length;
  console.log(`  FAIL  ${name}: ${rows.length}`);
  for (const r of rows.slice(0, 10)) console.log(`          ${r.id}${r.note ? `  ${r.note}` : ""}`);
  if (fix && repair) console.log(`          repaired ${await repair()}`);
}

async function main() {
  console.log("== roles follow tenancies");
  const tenantsWithoutLease = await db.$queryRaw<{ id: string; username: string }[]>`SELECT u.id::text, u.username FROM "User" u WHERE u.role = 'TENANT' AND NOT EXISTS (SELECT 1 FROM "RentalAgreement" a WHERE a."tenantId" = u.id AND a.status = 'ACTIVE')`;
  await check("a TENANT has an ACTIVE tenancy (otherwise the account is Tenant-Free)", tenantsWithoutLease.map((u) => ({ id: u.id, note: u.username })),
    async () => (await db.user.updateMany({ where: { id: { in: tenantsWithoutLease.map((u) => u.id) } }, data: { role: "GENERAL_USER" } })).count);

  const generalWithLease = await db.$queryRaw<{ id: string; username: string }[]>`SELECT u.id::text, u.username FROM "User" u WHERE u.role = 'GENERAL_USER' AND EXISTS (SELECT 1 FROM "RentalAgreement" a WHERE a."tenantId" = u.id AND a.status = 'ACTIVE')`;
  await check("nobody with an ACTIVE tenancy is still Tenant-Free (they are verified tenants)", generalWithLease.map((u) => ({ id: u.id, note: u.username })),
    async () => (await db.user.updateMany({ where: { id: { in: generalWithLease.map((u) => u.id) } }, data: { role: "TENANT" } })).count);

  const twoHomes = await db.$queryRaw<{ id: string; n: bigint }[]>`SELECT "tenantId"::text AS id, count(*) AS n FROM "RentalAgreement" WHERE status = 'ACTIVE' GROUP BY "tenantId" HAVING count(*) > 1`;
  await check("one home at a time: no tenant has two ACTIVE tenancies", twoHomes.map((r) => ({ id: r.id, note: `${r.n} active` })));

  console.log("== owners and plans");
  const ownersNoProfile = await db.$queryRaw<{ id: string; username: string }[]>`SELECT u.id::text, u.username FROM "User" u WHERE u.role = 'OWNER' AND NOT EXISTS (SELECT 1 FROM "OwnerProfile" p WHERE p."userId" = u.id)`;
  await check("every OWNER has an owner profile", ownersNoProfile.map((u) => ({ id: u.id, note: u.username })));
  const noCode = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "User" WHERE role = 'OWNER' AND "ownerCode" IS NULL`;
  if (Number(noCode[0]?.n ?? 0) > 0) console.log(`  note  ${noCode[0]!.n} owner(s) signed up before the Tenant-Free rule and have no Owner ID yet (it is issued when their first plan is approved)`);

  const paidNotOwner = await db.$queryRaw<{ id: string; username: string }[]>`SELECT u.id::text, u.username FROM "UserSubscription" s JOIN "User" u ON u.id = s."userId" WHERE s.audience = 'OWNER' AND s.status IN ('ACTIVE','GRACE') AND u.role <> 'OWNER'`;
  await check("a live owner plan always belongs to an OWNER (an approved payment never leaves a Tenant-Free account)", paidNotOwner.map((u) => ({ id: u.id, note: u.username })));

  const approvedNotOwner = await db.$queryRaw<{ id: string; username: string }[]>`SELECT r.id::text, u.username FROM "UpgradeRequest" r JOIN "User" u ON u.id = r."userId" JOIN "SubscriptionPlan" p ON p.id = r."planId" WHERE r.status = 'APPROVED' AND p.audience = 'OWNER' AND u.role NOT IN ('OWNER','SUPER_ADMIN','GOV_ADMIN')`;
  await check("every approved owner-plan request made its user an OWNER", approvedNotOwner.map((r) => ({ id: r.id, note: r.username })));

  const pendingButTenant = await db.$queryRaw<{ id: string; username: string }[]>`SELECT r.id::text, u.username FROM "UpgradeRequest" r JOIN "User" u ON u.id = r."userId" WHERE r.status = 'PENDING' AND EXISTS (SELECT 1 FROM "RentalAgreement" a WHERE a."tenantId" = u.id AND a.status = 'ACTIVE')`;
  await check("no pending owner-plan request belongs to a person who is now a verified tenant (it cannot be approved)", pendingButTenant.map((r) => ({ id: r.id, note: r.username })));

  console.log("== links follow the role (URL areas)");
  const oldOwner = await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM "Notification" WHERE link = '/owner' OR link LIKE '/owner/%'`;
  await check("no notification still links to the old /owner address", oldOwner,
    async () => Number(await db.$executeRaw`UPDATE "Notification" SET link = '/home-owner' || substr(link, 7) WHERE link = '/owner' OR link LIKE '/owner/%'`));
  // a link into one of the three areas must be the area of the person who reads it
  const base = `CASE u.role WHEN 'OWNER' THEN '/home-owner' WHEN 'TENANT' THEN '/tenant' WHEN 'GENERAL_USER' THEN '/tenant-free' END`;
  const wrongArea = await db.$queryRawUnsafe<{ id: string; note: string }[]>(`SELECT n.id::text, (u.role || ' → ' || n.link) AS note FROM "Notification" n JOIN "User" u ON u.id = n."userId" WHERE u.role IN ('OWNER','TENANT','GENERAL_USER') AND n.link ~ '^/(home-owner|tenant-free|tenant)(/|$)' AND NOT (n.link ~ ('^' || ${base} || '(/|$)'))`);
  await check("every notification link points into its reader's own area (/home-owner, /tenant or /tenant-free)", wrongArea,
    async () => Number(await db.$executeRawUnsafe(`UPDATE "Notification" n SET link = ${base} || regexp_replace(n.link, '^/(home-owner|tenant-free|tenant)', '') FROM "User" u WHERE u.id = n."userId" AND u.role IN ('OWNER','TENANT','GENERAL_USER') AND n.link ~ '^/(home-owner|tenant-free|tenant)(/|$)' AND NOT (n.link ~ ('^' || ${base} || '(/|$)'))`)));

  console.log("== records around tenancies (no orphans)");
  const unitFlag = await db.$queryRaw<{ id: string }[]>`SELECT a.id::text FROM "RentalAgreement" a JOIN "Unit" u ON u.id = a."unitId" WHERE a.status = 'ACTIVE' AND u.availability <> 'OCCUPIED' AND u.availability <> 'MAINTENANCE'`;
  await check("an ACTIVE tenancy sits in an occupied unit", unitFlag);
  const ghostUnit = await db.$queryRaw<{ id: string }[]>`SELECT u.id::text FROM "Unit" u WHERE u.availability = 'OCCUPIED' AND u."archivedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "RentalAgreement" a WHERE a."unitId" = u.id AND a.status = 'ACTIVE')`;
  await check("an OCCUPIED unit has an ACTIVE tenancy", ghostUnit);
  const strangerRequests = await db.$queryRaw<{ id: string }[]>`SELECT m.id::text FROM "MaintenanceRequest" m JOIN "RentalAgreement" a ON a.id = m."agreementId" WHERE m."tenantId" <> a."tenantId" OR m."unitId" <> a."unitId"`;
  await check("every repair request matches the tenant and unit of its tenancy", strangerRequests);
  const noUserRequests = await db.$queryRaw<{ id: string }[]>`SELECT m.id::text FROM "MaintenanceRequest" m WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = m."tenantId")`;
  await check("every repair request has a person behind it", noUserRequests);
  const strayImages = await db.$queryRaw<{ id: string }[]>`SELECT i.id::text FROM "MaintenanceImage" i WHERE NOT EXISTS (SELECT 1 FROM "MaintenanceRequest" m WHERE m.id = i."requestId")`;
  await check("every repair photo belongs to a request", strayImages);
  const strayPayments = await db.$queryRaw<{ id: string }[]>`SELECT p.id::text FROM "RentPayment" p WHERE NOT EXISTS (SELECT 1 FROM "RentRecord" r WHERE r.id = p."rentRecordId")`;
  await check("every rent payment belongs to a rent record", strayPayments);
  const overpaid = await db.$queryRaw<{ id: string }[]>`SELECT r.id::text FROM "RentRecord" r WHERE r.paid > r.total`;
  await check("no rent record is paid above its total", overpaid);
  const paidMismatch = await db.$queryRaw<{ id: string }[]>`SELECT r.id::text FROM "RentRecord" r WHERE r.paid <> COALESCE((SELECT sum(p.amount) FROM "RentPayment" p WHERE p."rentRecordId" = r.id AND p.status = 'VERIFIED'), 0)`;
  await check("every rent record's paid amount equals its verified payments", paidMismatch);
  const strayNotes = await db.$queryRaw<{ id: string }[]>`SELECT n.id::text FROM "Notification" n WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = n."userId")`;
  await check("every notification belongs to a person", strayNotes);

  console.log(problems === 0 ? "\nAll good." : `\n${problems} problem(s)${fix ? " (role mismatches were repaired above)" : " (run with --fix to repair role mismatches)"}.`);
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.$disconnect());
