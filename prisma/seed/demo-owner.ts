/**
 * Demo apartment owner with a realistic portfolio, for looking at the Owner pages.
 *   npm run db:seed:demo            create it (skips if it already exists)
 *   npm run db:seed:demo -- --reset delete the demo data and create it again
 *
 * Sign in at /en/login with the identifiers below. This is demo data on purpose: do not use these
 * credentials anywhere real. The e-mail uses example.com so nobody can claim it through "Forgot password".
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

export const DEMO_OWNER = { email: "demo.owner@example.com", username: "demo_owner", password: "Demo@Owner2026", fullName: "Faruk Ahmed", phone: "01711000000" };

const db = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** The four sample properties of the Properties List design: units / occupied → vacant is units − occupied. */
const PROPS = [
  { name: "Dhali Monzil", location: "Keraniganj, Dhaka, Bangladesh", upazila: "Keraniganj", area: "Keraniganj", sqft: 12000, units: 20, occupied: 16, floors: 5, lat: 23.6989, lng: 90.3563 },
  { name: "Mostofa Chowdhury Karim", location: "kodomtoli, Dhaka, Bali", upazila: "Jatrabari", area: "Kadamtali", sqft: 2000, units: 8, occupied: 5, floors: 3, lat: 23.7104, lng: 90.4332 },
  { name: "Nibas Ghor Chowdury", location: "Fokirapul, Dhaka, Bangladesh", upazila: "Motijheel", area: "Fakirapool", sqft: 1200, units: 26, occupied: 16, floors: 7, lat: 23.7305, lng: 90.4156 },
  { name: "Mostofa Kaionm building lk.", location: "kodomtoli, Dhaka", upazila: "Jatrabari", area: "Kadamtali", sqft: 8000, units: 8, occupied: 5, floors: 3, lat: 23.7112, lng: 90.4341 },
];
const FIRST = ["Rahim", "Karim", "Nasrin", "Sabbir", "Mitu", "Tanvir", "Shirin", "Jahid", "Farhana", "Imran", "Rubina", "Sohel", "Mahmuda", "Arif", "Lipi", "Kamal", "Sumi", "Rafiq"];
const LAST = ["Uddin", "Hossain", "Akter", "Ahmed", "Rahman", "Islam", "Sultana", "Hasan", "Yesmin", "Khan", "Begum"];
const CATEGORY = ["PLUMBING", "ELECTRICAL", "OTHER"];
const TITLES = ["Kitchen tap leaking", "Bedroom light not working", "Bathroom drain blocked", "Door lock is stuck", "Fan makes noise", "Water heater not heating", "Window latch broken", "Socket sparks", "Overhead tank overflow", "Wall paint peeling"];

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

interface UnitSeed { id: string; propertyId: string; unitNumber: string; floor: number; rent: number; occupied: boolean }
interface TenantSeed { index: number; unit: UnitSeed }

async function wipe() {
  const owner = await db.user.findUnique({ where: { email: DEMO_OWNER.email } });
  const tenants = await db.user.findMany({ where: { username: { startsWith: "demo_t" } }, select: { id: true } });
  const ids = [...tenants.map((t) => t.id), ...(owner ? [owner.id] : [])];
  if (!ids.length) return;
  const agreements = (await db.rentalAgreement.findMany({ where: { OR: [{ ownerId: { in: ids } }, { tenantId: { in: ids } }] }, select: { id: true } })).map((a) => a.id);
  const props = await db.property.findMany({ where: { ownerId: { in: ids } }, select: { id: true, addressId: true } });
  const records = (await db.rentRecord.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((r) => r.id);
  const reqs = (await db.maintenanceRequest.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((r) => r.id);
  const alerts = (await db.emergencyAlert.findMany({ where: { reporterId: { in: ids } }, select: { id: true } })).map((a) => a.id);
  const propIds = props.map((p) => p.id);
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.incidentReport.deleteMany({ where: { alertId: { in: alerts } } });
  await db.emergencyAlertEvent.deleteMany({ where: { alertId: { in: alerts } } });
  await db.emergencyAlert.deleteMany({ where: { id: { in: alerts } } });
  await db.maintenanceComment.deleteMany({ where: { requestId: { in: reqs } } });
  await db.maintenanceImage.deleteMany({ where: { requestId: { in: reqs } } });
  await db.maintenanceRequest.deleteMany({ where: { id: { in: reqs } } });
  await db.rentPayment.deleteMany({ where: { rentRecordId: { in: records } } });
  await db.rentRecord.deleteMany({ where: { id: { in: records } } });
  await db.tenantInvitation.deleteMany({ where: { ownerId: { in: ids } } });
  await db.rentalAgreement.deleteMany({ where: { id: { in: agreements } } });
  await db.unit.deleteMany({ where: { propertyId: { in: propIds } } });
  await db.propertyImage.deleteMany({ where: { propertyId: { in: propIds } } });
  await db.property.deleteMany({ where: { id: { in: propIds } } });
  await db.address.deleteMany({ where: { id: { in: props.map((p) => p.addressId).filter(Boolean) as string[] } } });
  await db.userSubscription.deleteMany({ where: { userId: { in: ids } } });
  await db.ownerProfile.deleteMany({ where: { userId: { in: ids } } });
  await db.tenantProfile.deleteMany({ where: { userId: { in: ids } } }); // created when an owner moves a tenant in
  await db.user.deleteMany({ where: { id: { in: ids } } });
  if (owner?.authId) await sb.auth.admin.deleteUser(owner.authId).catch(() => undefined);
}

async function main() {
  if (process.argv.includes("--reset")) await wipe();
  else if (await db.user.findUnique({ where: { email: DEMO_OWNER.email } })) {
    console.log(`Demo owner already exists (${DEMO_OWNER.email}). Use --reset to rebuild it.`);
    return;
  }

  // BILLIONAIRE: up to 12 properties and 500 units, so adding more properties in the demo works
  const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: "BILLIONAIRE" } });
  const { data: auth, error } = await sb.auth.admin.createUser({ email: DEMO_OWNER.email, password: DEMO_OWNER.password, email_confirm: true });
  if (error) throw error;

  const owner = await db.$transaction(async (tx) => {
    const [{ n }] = await tx.$queryRaw<{ n: string }[]>`SELECT nextval('owner_code_seq')::text AS n`;
    const u = await tx.user.create({
      data: { authId: auth.user.id, username: DEMO_OWNER.username, fullName: DEMO_OWNER.fullName, email: DEMO_OWNER.email, phone: DEMO_OWNER.phone, role: "OWNER", verificationStatus: "VERIFIED", locale: "en", ownerCode: `OW${n}`, occupation: "Businessman" },
    });
    await tx.ownerProfile.create({ data: { userId: u.id } });
    const { id: _i, createdAt: _c, updatedAt: _u, ...planFields } = plan;
    await tx.userSubscription.create({
      data: {
        userId: u.id, planId: plan.id, audience: "OWNER", cycle: "YEARLY", amount: plan.monthlyPrice.mul(9.6) /* yearly = 12 months − 20% */, planSnapshot: JSON.parse(JSON.stringify({ ...planFields, planId: plan.id })),
        startsAt: day(2026, 0, 1), endsAt: day(2027, 0, 1), graceEndsAt: new Date(day(2027, 0, 1).getTime() + 3 * 86400_000), status: "ACTIVE",
      },
    });
    return u;
  });

  const today = new Date();
  const thisMonth = today.getUTCMonth();
  const units: UnitSeed[] = [];
  const tenants: TenantSeed[] = [];

  for (const [pi, d] of [...PROPS.entries()].reverse()) { // newest first in the list: Dhali Monzil is created last
    const addr = await db.address.create({ data: { division: "Dhaka", district: "Dhaka", upazila: d.upazila, area: d.area } });
    const p = await db.property.create({
      data: { ownerId: owner.id, name: d.name, type: "APARTMENT_BUILDING", totalFloors: d.floors, addressId: addr.id, securityFeatures: ["CCTV", "GUARD_24_7"], verificationStatus: "VERIFIED", totalSqft: d.sqft, locationText: d.location, declaredUnits: d.units },
    });
    await db.$executeRawUnsafe(`UPDATE "Property" SET "location" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3::uuid`, d.lng, d.lat, p.id);
    for (let i = 0; i < d.units; i++) {
      const floor = Math.min(d.floors, Math.floor(i / Math.ceil(d.units / d.floors)) + 1);
      const rent = 12000 + ((pi * 7 + i * 3) % 7) * 1000; // ৳12,000 – ৳18,000
      const unit: UnitSeed = { id: randomUUID(), propertyId: p.id, unitNumber: `${floor}${String.fromCharCode(65 + (i % 8))}${pi + 1}`, floor, rent, occupied: i < d.occupied };
      units.push(unit);
      if (unit.occupied) tenants.push({ index: tenants.length, unit });
    }
  }

  await db.unit.createMany({
    data: units.map((u, i) => ({
      id: u.id, propertyId: u.propertyId, unitNumber: u.unitNumber, floor: u.floor, bedrooms: 2 + (i % 3), bathrooms: 1 + (i % 2), diningRooms: 1, kitchens: 1, areaSqft: 800 + (i % 6) * 60,
      rent: u.rent, deposit: u.rent * 2, furnishing: "SEMI_FURNISHED" as const, availability: u.occupied ? ("OCCUPIED" as const) : i % 2 === 0 ? ("MAINTENANCE" as const) : ("AVAILABLE" as const),
    })),
  });

  const users = tenants.map((t) => ({ id: randomUUID(), t, name: `${FIRST[t.index % FIRST.length]} ${LAST[(t.index * 3) % LAST.length]}` }));
  await db.user.createMany({
    data: users.map((u) => ({ id: u.id, username: `demo_t${u.t.index + 1}`, fullName: u.name, email: `demo.tenant${u.t.index + 1}@example.com`, phone: `0172${String(u.t.index + 1).padStart(7, "0")}`, role: "TENANT" as const, verificationStatus: "VERIFIED" as const, locale: "en" })),
  });

  // three registered tenants who do not rent yet: owners can find them by phone when adding a unit
  await db.user.createMany({
    data: ["Nadia Islam", "Rashed Khan", "Poly Akter"].map((name, i) => ({ id: randomUUID(), username: `demo_t_spare${i + 1}`, fullName: name, email: `demo.spare${i + 1}@example.com`, phone: `017300000${String(i + 1).padStart(2, "0")}`, role: "TENANT" as const, verificationStatus: "VERIFIED" as const, locale: "en" })),
  });

  const agreements = users.map((u) => ({ id: randomUUID(), u }));
  await db.rentalAgreement.createMany({
    data: agreements.map(({ id, u }) => ({
      id, unitId: u.t.unit.id, tenantId: u.id, ownerId: owner.id, rent: u.t.unit.rent, deposit: u.t.unit.rent * 2, startDate: day(2026, 0, 1),
      // a few leases end within 30 days ("Leave Soon"), a few tenants have given notice
      endDate: u.t.index % 9 === 4 ? new Date(today.getTime() + (12 + u.t.index) * 86400_000) : u.t.index === 3 ? new Date(today.getTime() + 40 * 86400_000) : day(2027, 5, 30),
      members: 1 + ((u.t.index * 7) % 5), noticeGivenAt: u.t.index % 11 === 7 ? new Date(today.getTime() - 3 * 86400_000) : null, status: "ACTIVE" as const, createdAt: new Date(today.getTime() - (u.t.index + 1) * 18 * 3600_000),
    })),
  });

  type Status = "PAID" | "PARTIAL" | "OVERDUE";
  const records: { id: string; agreementId: string; billingMonth: Date; rent: number; total: number; paid: number; dueDate: Date; status: Status; k: number; m: number }[] = [];
  for (const { id, u } of agreements) {
    for (let m = 0; m <= thisMonth; m++) {
      const k = u.t.index;
      const status: Status = m === thisMonth ? (k % 14 === 13 ? "OVERDUE" : k % 14 === 9 ? "PARTIAL" : "PAID") : "PAID";
      const rent = u.t.unit.rent;
      const paid = status === "PAID" ? rent : status === "PARTIAL" ? Math.round(rent / 2) : 0;
      records.push({ id: randomUUID(), agreementId: id, billingMonth: day(2026, m, 1), rent, total: rent, paid, dueDate: day(2026, m, 5), status, k, m });
    }
  }
  await db.rentRecord.createMany({ data: records.map(({ id, agreementId, billingMonth, rent, total, paid, dueDate, status }) => ({ id, agreementId, billingMonth, rent, total, paid, dueDate, status })) });

  let ref = 0;
  await db.rentPayment.createMany({
    data: records.filter((r) => r.paid > 0).map((r) => {
      const bkash = (r.k + r.m) % 2 === 0;
      const at = Math.min(today.getTime() - (r.m === thisMonth ? r.k * 3600_000 * 5 : 0), r.dueDate.getTime() + (1 + (r.k % 4)) * 86400_000);
      return { rentRecordId: r.id, amount: r.paid, method: bkash ? ("BKASH" as const) : ("CASH" as const), reference: bkash ? `DEMO${String(++ref).padStart(6, "0")}` : null, paidAt: new Date(at), recordedById: owner.id, status: "VERIFIED" as const };
    }),
  });

  // 30 maintenance requests: 21 completed (70%), 6 in progress, 3 pending
  await db.maintenanceRequest.createMany({
    data: agreements.slice(0, 30).map(({ id, u }, i) => ({
      agreementId: id, unitId: u.t.unit.id, tenantId: u.id, category: CATEGORY[i % 3]!, title: TITLES[i % TITLES.length]!, description: `${TITLES[i % TITLES.length]} in unit ${u.t.unit.unitNumber}. Please send someone to check.`,
      priority: i % 3 === 0 ? ("HIGH" as const) : ("MEDIUM" as const), status: i < 21 ? ("COMPLETED" as const) : i < 27 ? ("IN_PROGRESS" as const) : ("PENDING" as const), createdAt: new Date(today.getTime() - (i + 2) * 86400_000 * 2),
    })),
  });

  // no placeholder notifications: the owner's Notification Center fills from real events (payments, repairs, emergencies)

  console.log(`Demo owner ready: ${DEMO_OWNER.email} (${PROPS.length} properties, ${units.length} units, ${tenants.length} tenants, Jan–${today.toLocaleString("en", { month: "short" })} 2026 rent history).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
