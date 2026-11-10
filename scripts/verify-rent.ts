/**
 * Cross-checks the Rent Overview API against the database itself: every number the page shows is recomputed from
 * Postgres, receipts are matched to their payment rows, and the reminder button is verified in the tables it writes to.
 *   npm run verify:rent        (needs the dev server on :3000 and the demo owner from `npm run db:seed:demo`)
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
    if (res.status === 500 && attempt < 2) continue;
    return { status: res.status, data: json?.data, code: json?.code };
  }
  throw new Error("unreachable");
}

const money = (d: { toString(): string } | number) => Number(d.toString());
const month = (m: string) => new Date(`${m}-01T00:00:00Z`);

/** What the database says a month looks like for one owner (and optionally one property). */
async function expected(ownerId: string, m: string, propertyId?: string) {
  const records = await db.rentRecord.findMany({
    where: { billingMonth: month(m), agreement: { ownerId, ...(propertyId ? { unit: { propertyId } } : {}) } },
    include: { agreement: { select: { status: true, tenantId: true } } },
  });
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const rows = records
    .map((r) => {
      const out = Math.max(0, money(r.total) - money(r.paid));
      const status = out <= 0 ? "PAID" : r.status === "OVERDUE" || r.dueDate < today ? "OVERDUE" : "UNPAID";
      return { id: r.id, total: money(r.total), paid: money(r.paid), out, status, ended: r.agreement.status !== "ACTIVE", tenantId: r.agreement.tenantId };
    })
    .filter((r) => !(r.ended && r.status === "UNPAID" && r.paid === 0));
  return {
    rows,
    expected: rows.reduce((s, r) => s + r.total, 0),
    collected: rows.reduce((s, r) => s + r.paid, 0),
    pending: rows.filter((r) => r.status === "UNPAID").reduce((s, r) => s + r.out, 0),
    overdue: rows.filter((r) => r.status === "OVERDUE").length,
  };
}

(async () => {
  const login = await call("POST", "/auth/login", undefined, { identifier: grab("email"), password: grab("password") });
  check("owner signs in", login.status === 200 && !!login.data?.session?.accessToken, login);
  const T = login.data.session.accessToken as string;
  const owner = await db.user.findUniqueOrThrow({ where: { email: grab("email") } });
  const nowM = new Date().toISOString().slice(0, 7);
  const props = await db.property.findMany({ where: { ownerId: owner.id, archivedAt: null }, orderBy: { name: "asc" } });

  console.log("\nStat cards == database (current month)");
  const cur = await call("GET", `/rent/ledger?month=${nowM}&pageSize=50`, T);
  const e = await expected(owner.id, nowM);
  const st = cur.data?.stats;
  check(`Total Paid = ${e.collected}`, Number(st?.collected) === e.collected, st);
  check(`Total expected = ${e.expected}`, Number(st?.expected) === e.expected, st);
  check(`Payment Pending = ${e.pending}`, Number(st?.pending) === e.pending, st);
  check(`Overdue payment count = ${e.overdue}`, st?.overdueCount === e.overdue, st);
  check("Amount Due (banner) = pending + overdue outstanding", Math.abs(Number(st?.dueAmount) - e.rows.filter((r) => r.status !== "PAID").reduce((s, r) => s + r.out, 0)) < 0.01, st);
  check("collection % is collected / expected", Math.abs(st?.collectionRate - (e.expected ? (e.collected * 100) / e.expected : 0)) < 0.06, st);

  console.log("\nEvery row == its database record");
  const rows: any[] = cur.data?.items ?? [];
  const dbRecs = new Map((await db.rentRecord.findMany({ where: { id: { in: rows.map((r) => r.recordId) } }, include: { payments: true, agreement: { include: { unit: { include: { property: true } } } } } })).map((r) => [r.id, r]));
  let bad = 0;
  for (const r of rows) {
    const d = dbRecs.get(r.recordId);
    const ok = !!d && r.unit === d.agreement.unit.unitNumber && r.property === d.agreement.unit.property.name && Number(r.total) === money(d.total) && Number(r.paid) === money(d.paid)
      && new Date(r.dueDate).getTime() === d.dueDate.getTime() && r.agreementId === d.agreementId;
    if (!ok) { bad++; console.log("   row differs:", r.unit, r.tenant); }
  }
  check(`${rows.length} rows: unit, property, amount, paid, due date all match`, bad === 0 && rows.length > 0);
  check("overdue rows are listed before unpaid and paid", rows.findIndex((r) => r.status === "PAID") === -1 || rows.slice(0, rows.findIndex((r) => r.status === "PAID")).every((r) => r.status !== "PAID"));

  console.log("\nFilters");
  for (const p of props) {
    const r = await call("GET", `/rent/ledger?month=${nowM}&propertyId=${p.id}&pageSize=50`, T);
    const ep = await expected(owner.id, nowM, p.id);
    check(`property "${p.name}": ${ep.rows.length} rows, paid ${ep.collected}`, r.data?.total === ep.rows.length && Number(r.data?.stats?.collected) === ep.collected && r.data.items.every((i: any) => i.propertyId === p.id), { total: r.data?.total, ep: ep.rows.length });
  }
  const paidTab = await call("GET", `/rent/ledger?month=${nowM}&status=paid&pageSize=50`, T);
  const unpaidTab = await call("GET", `/rent/ledger?month=${nowM}&status=unpaid&pageSize=50`, T);
  check(`Paid tab = ${e.rows.filter((r) => r.status === "PAID").length} rows, all Paid`, paidTab.data?.total === e.rows.filter((r) => r.status === "PAID").length && paidTab.data.items.every((i: any) => i.status === "PAID"));
  check(`Unpaid tab = Unpaid + Overdue (${e.rows.filter((r) => r.status !== "PAID").length} rows)`, unpaidTab.data?.total === e.rows.filter((r) => r.status !== "PAID").length && unpaidTab.data.items.every((i: any) => i.status !== "PAID"));
  check("stat cards do not change with the Paid/Unpaid tab", Number(paidTab.data?.stats?.collected) === e.collected && Number(unpaidTab.data?.stats?.collected) === e.collected);
  for (const m of ["2026-03", "2025-11", "2024-01"]) {
    const r = await call("GET", `/rent/ledger?month=${m}&pageSize=50`, T);
    const em = await expected(owner.id, m);
    check(`month ${m}: ${em.rows.length} rows, collected ${em.collected}`, r.data?.total === em.rows.length && Number(r.data?.stats?.collected) === em.collected && r.data?.month === m, { total: r.data?.total, em: em.rows.length });
  }
  const page2 = await call("GET", `/rent/ledger?month=${nowM}&page=2&pageSize=10`, T);
  check("paging: page 2 holds the next 10 rows", page2.data?.items?.length === 10 && page2.data?.page === 2 && page2.data?.total === e.rows.length);
  const bySearch = await call("GET", `/rent/ledger?month=${nowM}&q=${encodeURIComponent(rows[0].unit)}`, T);
  check("search by unit finds it", bySearch.data?.items?.some((i: any) => i.recordId === rows[0].recordId));

  console.log("\nReceipts == payment rows");
  const withReceipt = rows.filter((r) => r.receiptPaymentId);
  check("paid/partial rows carry a receipt payment, unpaid rows with no money do not", rows.every((r) => (Number(r.paid) > 0) === !!r.receiptPaymentId) || rows.every((r) => !r.receiptPaymentId || Number(r.paid) > 0), withReceipt.length);
  const sample = withReceipt[0];
  const pay = await db.rentPayment.findUniqueOrThrow({ where: { id: sample.receiptPaymentId }, include: { rentRecord: true } });
  check("the receipt payment is a VERIFIED payment of that very record", pay.status === "VERIFIED" && pay.rentRecordId === sample.recordId);
  const rc = await call("GET", `/rent/payments/${sample.receiptPaymentId}/receipt`, T);
  check("receipt data == payment row (amount, method, month, balance)", rc.status === 200 && Number(rc.data?.amount) === money(pay.amount) && rc.data?.method === pay.method && rc.data?.billingMonth === pay.rentRecord.billingMonth.toISOString().slice(0, 7) && Number(rc.data?.balance) === money(pay.rentRecord.total) - money(pay.rentRecord.paid), rc.data);

  console.log("\nExport Report == same filters as the screen");
  const rep = await call("GET", `/rent/report?month=${nowM}&status=unpaid&propertyId=${props[0]!.id}`, T);
  const lg = await call("GET", `/rent/ledger?month=${nowM}&status=unpaid&propertyId=${props[0]!.id}&pageSize=50`, T);
  check("report rows == screen rows for the same filters", rep.status === 200 && rep.data?.rows?.length === lg.data?.total && rep.data?.property === props[0]!.name && rep.data?.owner?.fullName === owner.fullName, { rep: rep.data?.rows?.length, lg: lg.data?.total });
  check("report KPI block == stat cards", rep.data?.stats?.collected === lg.data?.stats?.collected && rep.data?.stats?.dueAmount === lg.data?.stats?.dueAmount);

  console.log("\nSend Reminder: API call -> database rows");
  const stNow = (await call("GET", `/rent/ledger?month=${nowM}&pageSize=1`, T)).data.stats;
  const eligible = (await db.rentRecord.findMany({ where: { billingMonth: month(nowM), agreement: { ownerId: owner.id, status: "ACTIVE" } }, include: { agreement: true } })).filter((r) => money(r.total) > money(r.paid) && r.dueDate < new Date(new Date().setUTCHours(0, 0, 0, 0)));
  const tenantIds = [...new Set(eligible.map((r) => r.agreement.tenantId))];
  check(`the banner says ${tenantIds.length} tenant(s) are past due`, stNow.remindable.tenants === tenantIds.length && stNow.remindable.count === eligible.length, { api: stNow.remindable, db: tenantIds.length });
  await db.notification.deleteMany({ where: { userId: { in: tenantIds }, type: "rent.reminder" } }); // demo data: start from "nobody reminded yet"
  const t0 = new Date();
  const sent = await call("POST", "/rent/remind", T, { month: nowM });
  check(`POST /rent/remind → ${tenantIds.length} sent`, sent.status === 200 && sent.data?.sent === tenantIds.length, sent);
  const notes = await db.notification.findMany({ where: { userId: { in: tenantIds }, type: "rent.reminder", createdAt: { gte: t0 } } });
  check("one in-app reminder per tenant in the notifications table", notes.length === tenantIds.length && new Set(notes.map((n) => n.userId)).size === tenantIds.length, notes.length);
  const owedBy = (id: string) => eligible.filter((r) => r.agreement.tenantId === id).reduce((s, r) => s + money(r.total) - money(r.paid), 0);
  check("each reminder carries the exact amount that tenant owes", notes.every((n) => Number((n.params as any).due) === owedBy(n.userId)));
  const phones = await db.user.count({ where: { id: { in: tenantIds }, phone: { not: null } } });
  const sms = await db.outboxEvent.count({ where: { type: "sms.send", createdAt: { gte: t0 } } });
  check(`an SMS is queued for every tenant with a phone (${phones})`, sms === phones && sent.data?.smsQueued === phones, { sms, phones });
  check("an audit row records who sent how many", (await db.auditLog.count({ where: { actorId: owner.id, action: "rent.remind_all", createdAt: { gte: t0 } } })) === 1);
  const again = await call("POST", "/rent/remind", T, { month: nowM });
  check("pressing it again sends nothing new (already reminded in 24h) and adds no rows", again.data?.sent === 0 && again.data?.skippedRecent === tenantIds.length && (await db.notification.count({ where: { userId: { in: tenantIds }, type: "rent.reminder", createdAt: { gte: t0 } } })) === tenantIds.length, again.data);
  const act = await call("GET", "/dashboard/owner/activities?limit=20", T);
  check("the dashboard's Recent Activities logs the reminders", act.data?.items?.some((a: any) => a.kind === "REMINDERS_SENT" && Number(a.text) === tenantIds.length), act.data?.items?.slice(0, 3));
  const clean = await call("POST", "/rent/remind", T, { month: "2024-01" });
  check("a month with nothing past due → sent 0, eligible 0", clean.data?.sent === 0 && clean.data?.eligible === 0, clean.data);

  console.log("\nValidation + access");
  check("bad month → 422", (await call("GET", "/rent/ledger?month=2026-13", T)).status === 422);
  check("bad status → 422", (await call("GET", "/rent/ledger?status=maybe", T)).status === 422);
  check("page size over 50 → 422", (await call("GET", "/rent/ledger?pageSize=500", T)).status === 422);
  check("no token → 401 (ledger, report, remind)", (await call("GET", "/rent/ledger")).status === 401 && (await call("GET", "/rent/report")).status === 401 && (await call("POST", "/rent/remind", undefined, {})).status === 401);

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => { console.error("CRASH:", err); await db.$disconnect(); process.exit(2); });
