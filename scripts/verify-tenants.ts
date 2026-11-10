/**
 * Cross-checks the Tenants Directory API against the database itself (not mocks): every number the page shows is
 * recomputed straight from Postgres, and every action (add, edit, remove) is verified in the tables it must change.
 *   npm run verify:tenants        (needs the dev server on :3000 and the demo owner from `npm run db:seed:demo`)
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000/api/v1";
const db = new PrismaClient();
const seed = readFileSync("prisma/seed/demo-owner.ts", "utf8");
const grab = (k: string) => seed.match(new RegExp(`${k}: "([^"]+)"`))![1]!;

let pass = 0, fail = 0;
const check = (label: string, value: unknown, info?: unknown) => {
  const ok = !!value;
  if (ok) { pass++; console.log("  ok  ", label); } else { fail++; console.log("  FAIL", label, info === undefined ? "" : JSON.stringify(info).slice(0, 300)); }
};

async function call(method: string, path: string, token?: string, body?: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => null);
    if (res.status === 500 && attempt < 2) continue; // pooler hiccup
    return { status: res.status, data: json?.data, code: json?.code, details: json?.details };
  }
  throw new Error("unreachable");
}

(async () => {
  const login = await call("POST", "/auth/login", undefined, { identifier: grab("email"), password: grab("password") });
  check("owner signs in", login.status === 200 && !!login.data?.session?.accessToken, login);
  const T = login.data.session.accessToken as string;
  const owner = await db.user.findUniqueOrThrow({ where: { email: grab("email") } });

  console.log("\nNumbers on the page == numbers in the database");
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const soon = new Date(start.getTime() + 30 * 86400_000);
  const dir = await call("GET", "/tenancies/directory?pageSize=50", T);
  const active = await db.rentalAgreement.count({ where: { ownerId: owner.id, status: "ACTIVE", unit: { archivedAt: null } } });
  const overdue = await db.rentalAgreement.count({ where: { ownerId: owner.id, status: "ACTIVE", unit: { archivedAt: null }, rentRecords: { some: { status: "OVERDUE" } } } });
  const leaving = await db.rentalAgreement.count({ where: { ownerId: owner.id, status: "ACTIVE", unit: { archivedAt: null }, endDate: { gte: start, lte: soon } } });
  check(`Active Tenants = ${active}`, dir.data?.stats?.active === active && dir.data?.total === active, dir.data?.stats);
  check(`Overdue Rent = ${overdue}`, dir.data?.stats?.overdue === overdue, dir.data?.stats);
  check(`Leave Soon = ${leaving}`, dir.data?.stats?.leaveSoon === leaving, dir.data?.stats);
  const tabOverdue = await call("GET", "/tenancies/directory?tab=overdue&pageSize=50", T);
  const tabLeave = await call("GET", "/tenancies/directory?tab=leaveSoon&pageSize=50", T);
  check("Overdue tab lists exactly the overdue tenancies", tabOverdue.data?.total === overdue && tabOverdue.data.items.every((i: any) => i.status === "OVERDUE"), tabOverdue.data?.total);
  check("Leave Soon tab lists exactly the tenancies ending within 30 days", tabLeave.data?.total === leaving && tabLeave.data.items.every((i: any) => i.leaveSoon), tabLeave.data?.total);

  console.log("\nEvery row == its database rows");
  const rows: any[] = dir.data?.items ?? [];
  const dbRows = await db.rentalAgreement.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { unit: { include: { property: true } } } });
  const users = new Map((await db.user.findMany({ where: { id: { in: dbRows.map((a) => a.tenantId) } } })).map((u) => [u.id, u]));
  const byId = new Map(dbRows.map((a) => [a.id, a]));
  let mismatches = 0;
  for (const r of rows) {
    const a = byId.get(r.id);
    const u = a && users.get(a.tenantId);
    const okRow = !!a && !!u && r.tenant.fullName === u.fullName && r.tenant.email === u.email && r.tenant.phone === u.phone && r.unit.unitNumber === a.unit.unitNumber && r.property.name === a.unit.property.name
      && r.members === a.members && r.rent === a.rent.toFixed(2) && new Date(r.startDate).getTime() === a.startDate.getTime() && (r.endDate ? new Date(r.endDate).getTime() === a.endDate?.getTime() : a.endDate === null)
      && ((r.status === "NOTICE_GIVEN") === (!!a.noticeGivenAt && r.status !== "OVERDUE"));
    if (!okRow) { mismatches++; console.log("   row differs:", r.tenant?.fullName, r.unit?.unitNumber); }
  }
  check(`${rows.length} rows: tenant, contact, unit, property, members, rent, dates, status all match`, mismatches === 0 && rows.length > 0);
  const occupiedUnits = await db.unit.count({ where: { property: { ownerId: owner.id }, archivedAt: null, availability: "OCCUPIED" } });
  check("every active tenancy sits on an OCCUPIED unit", occupiedUnits === active, { occupiedUnits, active });

  console.log("\nSearch");
  const sample = rows[0];
  const bySearch = await call("GET", `/tenancies/directory?q=${encodeURIComponent(sample.tenant.email)}`, T);
  check("search by e-mail finds that tenant", bySearch.data?.total >= 1 && bySearch.data.items.some((i: any) => i.id === sample.id), bySearch.data?.total);
  const byPhone = await call("GET", `/tenancies/directory?q=${sample.tenant.phone}`, T);
  check("search by phone finds that tenant", byPhone.data?.items?.some((i: any) => i.id === sample.id), byPhone.data?.total);

  console.log("\nLookup (phone and e-mail) == users table");
  const spare = await db.user.findFirstOrThrow({ where: { username: "demo_t_spare1" } });
  const lp = await call("GET", `/tenancies/lookup?phone=${spare.phone}`, T);
  const le = await call("GET", `/tenancies/lookup?email=${encodeURIComponent(spare.email!)}`, T);
  check("phone lookup returns the right account, not renting", lp.data?.found && lp.data.tenant.id === spare.id && lp.data.tenant.hasActiveTenancy === false, lp.data);
  check("e-mail lookup returns the same account with the e-mail masked", le.data?.found && le.data.tenant.id === spare.id && le.data.tenant.email !== spare.email && le.data.tenant.email.includes("•"), le.data);
  const nobody = await call("GET", "/tenancies/lookup?phone=01799999999", T);
  check("unknown number → found:false", nobody.data?.found === false, nobody.data);

  console.log("\nAdd a tenant: API call -> database rows");
  const vacant = await call("GET", "/units?status=VACANT&pageSize=1", T);
  const unit = vacant.data?.items?.[0];
  check("a vacant unit exists to use", !!unit, vacant);
  const unitBefore = await db.unit.findUniqueOrThrow({ where: { id: unit.id } });
  check("…and the database agrees it is AVAILABLE", unitBefore.availability === "AVAILABLE");
  const add = await call("POST", `/units/${unit.id}/tenant`, T, { tenantId: spare.id, startDate: "2026-11-10", endDate: "2027-05-31", members: 4 });
  check("POST /units/:id/tenant → 201", add.status === 201, add);
  const ag = await db.rentalAgreement.findFirst({ where: { unitId: unit.id, tenantId: spare.id, status: "ACTIVE" } });
  check("agreement row: ACTIVE, 4 members, dates, rent copied from the unit", !!ag && ag.members === 4 && ag.ownerId === owner.id && ag.startDate.toISOString().startsWith("2026-11-10") && ag.endDate?.toISOString().startsWith("2027-05-31") && ag.rent.equals(unitBefore.rent), ag);
  check("unit row is now OCCUPIED", (await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).availability === "OCCUPIED");
  check("this month's rent record was created", (await db.rentRecord.count({ where: { agreementId: ag!.id } })) === 1);
  check("the tenant got a notification", (await db.notification.count({ where: { userId: spare.id, type: "tenancy.assigned" } })) >= 1);
  check("an audit row was written", (await db.auditLog.count({ where: { actorId: owner.id, action: "tenancy.assign", resourceId: ag!.id } })) === 1);
  const dup = await call("POST", `/units/${unit.id}/tenant`, T, { tenantId: spare.id });
  check("adding the same tenant again is refused (409), nothing duplicated", dup.status === 409 && (await db.rentalAgreement.count({ where: { tenantId: spare.id, status: "ACTIVE" } })) === 1, dup);
  const dir2 = await call("GET", "/tenancies/directory", T);
  check("directory shows the new tenant first and Active Tenants went up by one", dir2.data?.items?.[0]?.id === ag!.id && dir2.data?.stats?.active === active + 1, dir2.data?.stats);

  console.log("\nEdit: API call -> database row");
  const edit = await call("PATCH", `/tenancies/${ag!.id}`, T, { members: 6, endDate: "2027-06-30", rent: 21000, deposit: 42000, noticeGiven: true });
  check("PATCH /tenancies/:id → 200", edit.status === 200, edit);
  const ag2 = await db.rentalAgreement.findUniqueOrThrow({ where: { id: ag!.id } });
  check("members, lease end, rent, deposit and noticeGivenAt are saved", ag2.members === 6 && ag2.endDate?.toISOString().startsWith("2027-06-30") && ag2.rent.equals(21000) && ag2.deposit.equals(42000) && !!ag2.noticeGivenAt, ag2);
  const dir3 = await call("GET", `/tenancies/directory?q=${encodeURIComponent(spare.email!)}`, T);
  check("the list shows NOTICE_GIVEN, 6 members", dir3.data?.items?.[0]?.status === "NOTICE_GIVEN" && dir3.data.items[0].members === 6, dir3.data?.items?.[0]);
  const bad = await call("PATCH", `/tenancies/${ag!.id}`, T, { endDate: "2026-01-01" });
  check("a lease end before the start date is rejected (422) and not saved", bad.status === 422 && (await db.rentalAgreement.findUniqueOrThrow({ where: { id: ag!.id } })).endDate?.toISOString().startsWith("2027-06-30"), bad);

  console.log("\nMessage: API call -> database rows");
  const conv = await call("POST", "/conversations", T, { type: "DIRECT", recipientId: spare.id });
  check("conversation opens", (conv.status === 201 || conv.status === 200) && !!conv.data?.id, conv);
  const text = `verify ${Date.now()}`;
  const sent = await call("POST", `/conversations/${conv.data.id}/messages`, T, { clientId: crypto.randomUUID(), body: text });
  check("message is accepted", sent.status === 201 || sent.status === 200, sent);
  const saved = await db.message.findFirst({ where: { conversationId: conv.data.id, body: text } });
  check("message row exists with the owner as sender", saved?.senderId === owner.id, saved);

  console.log("\nRemove: API call -> database rows");
  const end = await call("POST", `/tenancies/${ag!.id}/end`, T, { reason: "verification run" });
  check("POST /tenancies/:id/end → 200", end.status === 200, end);
  const ag3 = await db.rentalAgreement.findUniqueOrThrow({ where: { id: ag!.id } });
  check("agreement is ENDED", ag3.status === "ENDED", ag3.status);
  check("the unit is AVAILABLE again", (await db.unit.findUniqueOrThrow({ where: { id: unit.id } })).availability === "AVAILABLE");
  const dir4 = await call("GET", "/tenancies/directory", T);
  check("Active Tenants is back to the starting number and the tenant is gone from the list", dir4.data?.stats?.active === active && !dir4.data.items.some((i: any) => i.id === ag!.id), dir4.data?.stats);
  const again = await call("POST", `/tenancies/${ag!.id}/end`, T, {});
  check("removing twice is refused (409)", again.status === 409, again);

  console.log("\nAccess control");
  const anon = await call("GET", "/tenancies/directory");
  check("no token → 401", anon.status === 401, anon);

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("CRASH:", e); await db.$disconnect(); process.exit(2); });
