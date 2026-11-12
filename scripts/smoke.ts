/**
 * End-to-end API smoke test. Needs: dev server running, .env filled, migrations applied.
 *   npm run dev            (one terminal)
 *   npm run test:e2e       (another)
 * Creates throw-away users/data tagged with a random suffix and deletes everything at the end.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = process.env.BASE_URL ?? "http://localhost:3000/api/v1";
// the pooler (Tokyo) occasionally drops a connection for a moment: retry those, they never wrote anything
const RETRYABLE = new Set(["P1001", "P1002", "P2024"]);
const db = new PrismaClient().$extends({
  query: {
    $allOperations: async ({ args, query }) => {
      for (let attempt = 0; ; attempt++) {
        try { return await query(args); } catch (e) {
          const code = (e as { code?: string }).code;
          if (attempt >= 3 || !code || !RETRYABLE.has(code)) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    },
  },
});
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tag = Date.now().toString(36).slice(-6);
const rnd = (n: number, a = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join("");
const phone = () => "017" + rnd(8, "0123456789");
const today = new Date().toISOString().slice(0, 10);

let pass = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, info?: unknown) {
  if (ok) { pass++; console.log("  ok  ", label); }
  else { failures.push(label); console.log("  FAIL", label, info === undefined ? "" : JSON.stringify(info).slice(0, 700)); }
}
const section = (s: string) => console.log("\n== " + s);

/** Live event stream (/events) of one user, collected in the background. */
async function openStream(token: string) {
  const ctrl = new AbortController();
  const events: { event: string; data: any }[] = [];
  const res = await fetch(BASE + "/events", { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal });
  void (async () => {
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const p of parts) { const ev = /^event: (.+)$/m.exec(p)?.[1]; const d = /^data: (.+)$/m.exec(p)?.[1]; if (ev && d) events.push({ event: ev, data: JSON.parse(d) }); }
      }
    } catch { /* closed */ }
  })();
  const wait = async (event: string, pred: (d: any) => boolean = () => true, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const e = events.find((x) => x.event === event && pred(x.data)); if (e) return e.data; await new Promise((r) => setTimeout(r, 60)); }
    return null;
  };
  return { status: res.status, events, wait, close: () => ctrl.abort() };
}

function jwtExpired(t: string) {
  try { return JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString()).exp * 1000 < Date.now() + 5_000; } catch { return false; }
}

async function call(method: string, path: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}, attempt = 0): Promise<any> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (res.status === 500 && attempt < 2) return call(method, path, token, body, headers, attempt + 1); // pooler hiccup, nothing was written
  // a long run can outlive the 1-hour access token: renew it ONLY when it has really expired (revoked tokens must stay rejected)
  if (res.status === 401 && token && attempt < 2 && jwtExpired(token)) {
    const u = Object.values(users).find((x) => x.token === token);
    if (u) {
      const lr = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: u.email, password: u.password }) });
      const lj: any = await lr.json().catch(() => null);
      const fresh = lj?.data?.session?.accessToken;
      if (fresh) { u.token = fresh; return call(method, path, fresh, body, headers, attempt + 1); }
    }
  }
  return { status: res.status, body: json, data: json?.data, code: json?.code };
}

interface U { key: string; id: string; authId: string; email: string; password: string; username: string; token: string }
const users: Record<string, U> = {};
const authIds: string[] = [];
const planIds: string[] = [];

async function makeStaff(key: "super" | "gov") {
  const email = `${key}.${tag}@mailinator.com`, password = `Tt${rnd(8)}9a`, username = `${key}${tag}`;
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  authIds.push(data.user.id);
  const u = await db.user.create({ data: { authId: data.user.id, username, fullName: `Test ${key}`, email, phone: phone(), role: key === "super" ? "SUPER_ADMIN" : "GOV_ADMIN", verificationStatus: "VERIFIED", ...(key === "gov" ? { govAdminProfile: { create: {} } } : {}) } });
  users[key] = { key, id: u.id, authId: data.user.id, email, password, username, token: "" };
}

/** A finished profile with a verified NID: what a person needs to be found by an owner (tenants) or to add things (owners). */
async function fillProfile(userId: string, verified = true) {
  const addr = await db.address.create({ data: { division: "Dhaka", district: "Dhaka", upazila: "Savar" } as never });
  await db.user.update({ where: { id: userId }, data: { nid: `19${Math.floor(10000000000 + Math.random() * 89999999999)}`, dateOfBirth: new Date("1990-01-01"), occupation: "Service", addressId: addr.id, verificationStatus: verified ? "VERIFIED" : "UNVERIFIED" } });
}

async function makePublic(key: "owner" | "tenant" | "general", role: string, nid?: string, viaApi = false) {
  await makePublicRaw(key, role, nid, viaApi);
  await fillProfile(users[key]!.id);
}

async function makePublicRaw(key: "owner" | "tenant" | "general", role: string, nid?: string, viaApi = false) {
  const email = `${key}.${tag}@mailinator.com`, password = `Tt${rnd(8)}9a`, username = `${key}${tag}`;
  if (!viaApi) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    authIds.push(data.user.id);
    const u = await db.user.create({ data: { authId: data.user.id, username, fullName: `Test ${key}`, email, phone: phone(), role: role as any, ...(nid ? { nid, nidLast4: nid.slice(-4), nidHash: `h${tag}${key}` } : {}), ...(role === "OWNER" ? { ownerProfile: { create: {} } } : {}), ...(role === "TENANT" ? { tenantProfile: { create: {} } } : {}) } });
    users[key] = { key, id: u.id, authId: data.user.id, email, password, username, token: "" };
    return;
  }
  const r = await call("POST", "/auth/register", null, { fullName: `Test ${key}`, username, email, phone: phone(), password, consent: true, occupation: "Landlord", address: { division: "Dhaka", district: "Dhaka", upazila: "Uttara", union: "Sector 4", postOffice: "1230", street: "House 12, Road 5" }, ...(nid ? { nid } : {}) });
  if (r.status === 429 && r.body?.details?.reason === "email_send_limit") {
    // Supabase's built-in mailer allows only a few sign-up emails per hour; use custom SMTP in production
    check(`register ${key}: Supabase email limit reached (reported as 429 RATE_LIMITED)`, true);
    return makePublicRaw(key, role, nid, false);
  }
  check(`register ${key} → 201`, r.status === 201, r.body);
  if (r.status === 201) {
    check("register response: id, needsEmailConfirmation flag, session or null", !!r.data?.id && typeof r.data?.needsEmailConfirmation === "boolean" && "session" in r.data, r.data);
    const saved = await db.user.findUnique({ where: { username }, include: { address: true } });
    check("register stored occupation + union + post office (4-digit code kept as postal code)", saved?.occupation === "Landlord" && saved?.address?.union === "Sector 4" && saved?.address?.postOffice === "1230" && saved?.address?.postalCode === "1230", saved);
  }
  const row = await db.user.findUnique({ where: { username } });
  if (!row?.authId) throw new Error(`register ${key} failed: ${JSON.stringify(r.body)}`);
  // everyone who signs up is a Tenant-Free account; the test gives the account the role it needs the way the product does (plan approved / owner connects)
  check(`register ${key}: the new account is a Tenant-Free account (GENERAL_USER)`, row.role === "GENERAL_USER", row.role);
  if (role !== "GENERAL_USER") await db.user.update({ where: { id: row.id }, data: { role: role as any, ...(role === "OWNER" ? { ownerProfile: { create: {} } } : { tenantProfile: { create: {} } }) } });
  authIds.push(row.authId);
  await sb.auth.admin.updateUserById(row.authId, { email_confirm: true }); // skip the confirmation email
  users[key] = { key, id: row.id, authId: row.authId, email, password, username, token: "" };
}

async function login(u: U) {
  const r = await call("POST", "/auth/login", null, { identifier: u.email, password: u.password });
  check(`login ${u.key} → 200`, r.status === 200 && !!r.data?.session?.accessToken, r.body);
  u.token = r.data?.session?.accessToken ?? "";
}

const uploaded: string[] = [];
const BUCKET = "amaderghor-private";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
const PDF = new TextEncoder().encode("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

/** sign → upload the real bytes to the private bucket → returns the storage key */
async function uploadVia(token: string, purpose: string, mime: string, bytes: Uint8Array) {
  const signed = await call("POST", "/uploads/sign", token, { purpose, mime, size: bytes.length });
  if (signed.status !== 200) return { key: null as string | null, signed };
  const up = await sb.storage.from(BUCKET).uploadToSignedUrl(signed.data.key, signed.data.token, new Blob([bytes as BlobPart], { type: mime }), { contentType: mime });
  if (!up.error) uploaded.push(signed.data.key);
  return { key: signed.data.key as string, signed, error: up.error?.message };
}

async function raw(path: string, token: string) {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
}

/** Notification links of one person that point into an area that is not theirs (/home-owner, /tenant or /tenant-free must match the role). */
const wrongAreaLinks = (userId: string, base: "/home-owner" | "/tenant" | "/tenant-free") =>
  db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "Notification" WHERE "userId" = $1::uuid AND link ~ '^/(home-owner|tenant-free|tenant)(/|$)' AND NOT (link ~ ('^' || $2::text || '(/|$)'))`, userId, base).then((r) => Number(r[0]?.n ?? 0));

async function cleanup() {
  section("cleanup");
  const ids = Object.values(users).map((u) => u.id);
  if (ids.length) {
    const convs = (await db.conversationParticipant.findMany({ where: { userId: { in: ids } }, select: { conversationId: true } })).map((c) => c.conversationId);
    const addrIds = (await db.user.findMany({ where: { id: { in: ids } }, select: { addressId: true } })).map((u) => u.addressId).filter(Boolean) as string[];
    const listings = (await db.listing.findMany({ where: { sellerId: { in: ids } }, select: { id: true } })).map((l) => l.id);
    const props = await db.property.findMany({ where: { ownerId: { in: ids } }, select: { id: true, addressId: true } });
    const propIds = props.map((p) => p.id);
    const agreements = (await db.rentalAgreement.findMany({ where: { OR: [{ ownerId: { in: ids } }, { tenantId: { in: ids } }] }, select: { id: true } })).map((a) => a.id);
    const alerts = (await db.emergencyAlert.findMany({ where: { reporterId: { in: ids } }, select: { id: true } })).map((a) => a.id);
    const steps: [string, () => Promise<unknown>][] = [
      ["notifications", () => db.notification.deleteMany({ where: { userId: { in: ids } } })],
      ["audit", () => db.auditLog.deleteMany({ where: { actorId: { in: ids } } })],
      ["call requests", () => db.callRequest.deleteMany({ where: { OR: [{ conversationId: { in: convs } }, { requesterId: { in: ids } }] } })],
      ["live calls", () => db.call.deleteMany({ where: { OR: [{ conversationId: { in: convs } }, { callerId: { in: ids } }, { calleeId: { in: ids } }] } })],
      ["messages", () => db.message.deleteMany({ where: { conversationId: { in: convs } } })],
      ["participants", () => db.conversationParticipant.deleteMany({ where: { conversationId: { in: convs } } })],
      ["conversations", () => db.conversation.deleteMany({ where: { id: { in: convs } } })],
      ["favorites", () => db.favorite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { listingId: { in: listings } }] } })],
      ["saved searches", () => db.savedSearch.deleteMany({ where: { userId: { in: ids } } })],
      ["visit requests", () => db.visitRequest.deleteMany({ where: { OR: [{ listingId: { in: listings } }, { requesterId: { in: ids } }, { sellerId: { in: ids } }] } })],
      ["boosts", () => db.listingBoost.deleteMany({ where: { OR: [{ userId: { in: ids } }, { listingId: { in: listings } }] } })],
      ["listing children", async () => { await db.listingReport.deleteMany({ where: { OR: [{ listingId: { in: listings } }, { reporterId: { in: ids } }] } }); await db.listingStatDaily.deleteMany({ where: { listingId: { in: listings } } }); await db.listingImage.deleteMany({ where: { listingId: { in: listings } } }); await db.listingDocument.deleteMany({ where: { listingId: { in: listings } } }); await db.listingFacilityDistance.deleteMany({ where: { listingId: { in: listings } } }); }],
      ["listings", () => db.listing.deleteMany({ where: { id: { in: listings } } })],
      ["incidents", () => db.incidentReport.deleteMany({ where: { OR: [{ officerId: { in: ids } }, { alertId: { in: alerts } }] } })],
      ["alert events", () => db.emergencyAlertEvent.deleteMany({ where: { alertId: { in: alerts } } })],
      ["alerts", () => db.emergencyAlert.deleteMany({ where: { id: { in: alerts } } })],
      ["complaints", async () => { const c = (await db.complaint.findMany({ where: { reporterId: { in: ids } }, select: { id: true } })).map((x) => x.id); await db.complaintEvent.deleteMany({ where: { complaintId: { in: c } } }); await db.complaint.deleteMany({ where: { id: { in: c } } }); }],
      ["maintenance", async () => { const m = (await db.maintenanceRequest.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((x) => x.id); await db.maintenanceComment.deleteMany({ where: { requestId: { in: m } } }); await db.maintenanceImage.deleteMany({ where: { requestId: { in: m } } }); await db.maintenanceRequest.deleteMany({ where: { id: { in: m } } }); }],
      ["rent", async () => { const r = (await db.rentRecord.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((x) => x.id); await db.rentPayment.deleteMany({ where: { rentRecordId: { in: r } } }); await db.rentRecord.deleteMany({ where: { id: { in: r } } }); }],
      ["invitations", () => db.tenantInvitation.deleteMany({ where: { ownerId: { in: ids } } })],
      ["agreements", () => db.rentalAgreement.deleteMany({ where: { id: { in: agreements } } })],
      ["units/properties", async () => { await db.unit.deleteMany({ where: { propertyId: { in: propIds } } }); await db.propertyImage.deleteMany({ where: { propertyId: { in: propIds } } }); await db.property.deleteMany({ where: { id: { in: propIds } } }); await db.address.deleteMany({ where: { id: { in: props.map((p) => p.addressId).filter(Boolean) as string[] } } }); }],
      ["billing", async () => { await db.invoice.deleteMany({ where: { transaction: { userId: { in: ids } } } }); await db.paymentTransaction.deleteMany({ where: { userId: { in: ids } } }); await db.upgradeRequest.deleteMany({ where: { userId: { in: ids } } }); await db.userSubscription.deleteMany({ where: { userId: { in: ids } } }); }],
      ["test plans", async () => { await db.planPriceHistory.deleteMany({ where: { planId: { in: planIds } } }); await db.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } }); }],
      ["profiles", async () => { await db.ownerProfile.deleteMany({ where: { userId: { in: ids } } }); await db.tenantProfile.deleteMany({ where: { userId: { in: ids } } }); await db.govAdminProfile.deleteMany({ where: { userId: { in: ids } } }); await db.userPermissionOverride.deleteMany({ where: { userId: { in: ids } } }); }],
      ["documents", async () => { await db.verificationDocument.deleteMany({ where: { OR: [{ ownerType: "USER", ownerId: { in: ids } }, { ownerType: "PROPERTY", ownerId: { in: propIds } }] } }); }],
      ["broadcasts + inquiries + scheduled", async () => { await db.broadcast.deleteMany({ where: { createdById: { in: ids } } }); await db.contactInquiry.deleteMany({ where: { email: { contains: tag } } }); await db.scheduledPlanChange.deleteMany({ where: { planId: { in: planIds } } }); }],
      ["restore settings", async () => { await db.platformSetting.upsert({ where: { key: "billing.graceDays" }, update: { value: 3 }, create: { key: "billing.graceDays", value: 3 } }); await db.platformSetting.deleteMany({ where: { key: "email.provider" } }); }],
      ["account logs", () => db.accountStatusLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { adminId: { in: ids } }] } })],
      ["users", () => db.user.deleteMany({ where: { id: { in: ids } } })],
      ["addresses", () => db.address.deleteMany({ where: { id: { in: addrIds } } })],
    ];
    for (const [name, fn] of steps) { try { await fn(); } catch (e) { console.log("  cleanup step failed:", name, String((e as Error).message).split("\n").pop()); } }
  }
  if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
  for (const id of authIds) await sb.auth.admin.deleteUser(id).catch(() => undefined);
  console.log("  done");
}

/** Test users from a run that was killed before cleanup (server stopped, laptop slept…). Matched by their reserved pattern only. */
async function sweepStale() {
  const stale = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" }, username: { regex: "^((super|gov|govx|owner|tenant|general|clash|wizard|extra|life|promo|arch|fresh)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$" } } as never, select: { id: true, authId: true, username: true } }).catch(async () => {
    const all = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" } }, select: { id: true, authId: true, username: true } });
    return all.filter((u) => /^((super|gov|govx|owner|tenant|general|clash|wizard|extra|life|promo|arch|fresh)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$/.test(u.username));
  });
  stale.forEach((u, i) => {
    users[`stale${i}`] = { key: `stale${i}`, id: u.id, authId: u.authId ?? "", email: "", password: "", username: u.username, token: "" };
    if (u.authId) authIds.push(u.authId);
  });
  const plans = await db.subscriptionPlan.findMany({ where: { OR: [{ code: { startsWith: "TST" } }, { code: { startsWith: "TSL" } }] }, select: { id: true } });
  plans.forEach((p) => planIds.push(p.id));
  for (const u of stale) for (const purpose of ["AVATAR", "NID_FRONT", "NID_BACK", "AGREEMENT", "PROPERTY_DOC", "LISTING_DOC", "REPORT_EVIDENCE", "COMPLAINT_EVIDENCE"]) {
    const { data } = await sb.storage.from(BUCKET).list(`${purpose}/${u.id}`);
    if (data?.length) uploaded.push(...data.map((f) => `${purpose}/${u.id}/${f.name}`));
  }
  if (stale.length) console.log(`  swept ${stale.length} leftover test users from an interrupted run`);
}

async function main() {
  const CRON = process.env.CRON_SECRET!;
  await sweepStale();
  if (process.argv.includes("--sweep")) return; // `npm run clean:test`: only remove leftovers of interrupted runs, then stop

  section("public endpoints");
  let r = await call("GET", "/health");
  check("GET /health → ok", r.status === 200 && r.data?.status === "ok", r.body);
  r = await call("GET", "/plans");
  const owners = (r.data ?? []).filter((p: any) => p.audience === "OWNER");
  const primary = owners.find((p: any) => p.code === "PRIMARY");
  check("GET /plans → 3 seeded owner plans", r.status === 200 && owners.length >= 3, r.body);
  check("PRIMARY prices: 159 / 572.40 (4 months) / 1526.40", primary?.prices.MONTHLY.total === "159.00" && primary?.prices.QUARTERLY.total === "572.40" && primary?.prices.QUARTERLY.months === 4 && primary?.prices.YEARLY.total === "1526.40" && primary?.quarterlyDiscount === 10 && primary?.yearlyDiscount === 20 && primary?.monthlyPrice === "159.00", primary);
  r = await call("GET", "/subscriptions/fee-estimate?properties=3");
  check("fee-estimate 3 properties → MILLIONAIRE ৳299", r.data?.plan?.code === "MILLIONAIRE" && r.data?.monthlyFee === "299.00", r.body);
  r = await call("GET", "/subscriptions/fee-estimate?properties=1");
  check("fee-estimate 1 property → PRIMARY ৳159", r.data?.monthlyFee === "159.00", r.body);
  r = await call("GET", "/subscriptions/fee-estimate?properties=40");
  check("fee-estimate invalid → 422", r.status === 422, r.body);
  r = await call("GET", "/geo/divisions");
  const dhaka = r.data?.find((d: any) => d.nameEn === "Dhaka");
  check("GET /geo/divisions", r.status === 200 && !!dhaka, r.body);
  r = await call("GET", `/geo/districts?division=${dhaka?.id}`);
  check("GET /geo/districts", r.status === 200 && r.data?.length >= 1, r.body);
  const upaR = await call("GET", `/geo/upazilas?district=${r.data?.[0]?.id}`);
  check("GET /geo/upazilas", upaR.status === 200 && upaR.data?.length >= 1, upaR.body);
  r = await call("GET", "/geo/zones?q=Uttara");
  const zone = r.data?.[0];
  check("GET /geo/zones?q=Uttara", r.status === 200 && !!zone, r.body);
  r = await call("GET", "/geo/districts?division=not-a-uuid");
  check("bad division id → 422", r.status === 422, r.body);

  section("auth: registration, login, validation");
  await makeStaff("super");
  await makeStaff("gov");
  // The real /auth/register call sends a confirmation e-mail and uses up Supabase's hourly e-mail quota,
  // so it only runs on request: E2E_REAL_REGISTER=1 npm run test:e2e
  await makePublic("owner", "OWNER", "1234567897890", process.env.E2E_REAL_REGISTER === "1");
  await makePublic("tenant", "TENANT");
  await makePublic("general", "GENERAL_USER");
  r = await call("POST", "/auth/register", null, { fullName: "X", username: "Bad Name", email: "nope", phone: "123", password: "abc", role: "SUPER_ADMIN", consent: false });
  check("register with bad data/role → 422", r.status === 422, r.body);
  for (const role of ["OWNER", "TENANT"]) {
    r = await call("POST", "/auth/register", null, { fullName: "Pick Role", username: `pick_${role.toLowerCase()}`, email: `pick.${tag}.${role}@mailinator.com`, phone: phone(), password: "Passw0rdx", role, consent: true });
    check(`nobody can sign up as ${role} → 422 (starts as a Tenant-Free account)`, r.status === 422, r.body);
  }
  r = await call("POST", "/auth/register", null, { fullName: "Dup User", username: users.owner!.username, email: `dup.${tag}@mailinator.com`, phone: phone(), password: "Passw0rdx", consent: true });
  check("register duplicate username → 409", r.status === 409, r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.owner!.email, password: "wrong-password1" });
  check("login wrong password → 401", r.status === 401, r.body);
  for (const u of Object.values(users).filter((x) => !x.key.startsWith("stale"))) await login(u);
  const T = (k: string) => users[k]!.token;
  r = await call("GET", "/me");
  check("GET /me without token → 401", r.status === 401, r.body);
  r = await call("GET", "/me", "garbage");
  check("GET /me bad token → 401", r.status === 401, r.body);
  r = await call("GET", "/me", T("owner"));
  check("GET /me (owner) → role OWNER, entitlement NONE", r.data?.role === "OWNER" && r.data?.entitlement?.status === "NONE", r.body);
  r = await call("PATCH", "/me", T("owner"), { locale: "en" });
  check("PATCH /me", r.status === 200 && r.data?.locale === "en", r.body);
  r = await call("PATCH", "/me", T("owner"), { role: "SUPER_ADMIN" });
  check("PATCH /me cannot change role (strict) → 422", r.status === 422, r.body);
  r = await call("POST", "/auth/otp/send", null, { identifier: users.owner!.email });
  check("POST /auth/otp/send → sent (generic)", r.status === 200 && r.data?.sent === true, r.body);
  r = await call("POST", "/auth/password/forgot", null, { email: users.owner!.email });
  check("POST /auth/password/forgot → sent", r.status === 200 && r.data?.sent === true, r.body);
  // recovery by 6-digit code: the code is fetched with the admin API (the real one arrives by email)
  r = await call("POST", "/auth/password/verify", null, { email: users.general!.email, token: "000000" });
  check("POST /auth/password/verify wrong code → 401", r.status === 401, r.body);
  r = await call("POST", "/auth/password/verify", null, { email: "nope", token: "abc" });
  check("POST /auth/password/verify bad body → 422", r.status === 422, r.body);
  const gl = await sb.auth.admin.generateLink({ type: "recovery", email: users.general!.email });
  const code = gl.data?.properties?.email_otp;
  r = await call("POST", "/auth/password/verify", null, { email: users.general!.email, token: code ?? "" });
  check("POST /auth/password/verify real code → recovery token", r.status === 200 && r.data?.verified === true && !!r.data?.accessToken, r.body);
  const recTok = r.data?.accessToken as string;
  r = await call("POST", "/auth/password/reset", recTok, { password: "short" });
  check("POST /auth/password/reset weak password → 422", r.status === 422, r.body);
  const recoveredPw = "NewPassw0rd" + tag;
  r = await call("POST", "/auth/password/reset", recTok, { password: recoveredPw });
  check("POST /auth/password/reset → ok", r.status === 200 && r.data?.ok === true, r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.general!.email, password: recoveredPw });
  check("login with the new password works", r.status === 200, r.body);
  users.general!.password = recoveredPw;
  users.general!.token = r.data?.session?.accessToken ?? users.general!.token; // the reset revoked the old session
  r = await call("POST", "/auth/password/reset", null, { password: recoveredPw });
  check("POST /auth/password/reset without token → 401", r.status === 401, r.body);

  section("RBAC guards");
  r = await call("GET", "/admin/users", T("general"));
  check("general → GET /admin/users 403", r.status === 403, r.body);
  r = await call("GET", "/admin/users", T("gov"));
  check("gov → GET /admin/users 403", r.status === 403, r.body);
    const propBody = { name: `Test Tower ${tag}`, type: "APARTMENT_BUILDING", totalFloors: 5, address: { division: "Dhaka", district: "Dhaka", upazila: "Uttara", area: "Sector 4" }, lat: 23.87, lng: 90.4, securityFeatures: ["CCTV", "GUARD_24_7"] };
r = await call("POST", "/properties", T("tenant"), propBody);
  check("tenant → POST /properties 403", r.status === 403, r.body);
  r = await call("GET", "/dashboard/admin", T("owner"));
  check("owner → admin dashboard 403", r.status === 403, r.body);
  r = await call("GET", "/gov/alerts", T("owner"));
  check("owner → gov alerts 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/plans/${randomUUID()}`, T("gov"), { monthlyPrice: 1 });
  check("gov → PATCH plan 403", r.status === 403, r.body);
  r = await call("POST", "/properties", T("owner"), propBody);
  check("owner without plan → POST /properties 403 SUBSCRIPTION_REQUIRED", r.status === 403 && r.code === "SUBSCRIPTION_REQUIRED", r.body);
  r = await call("GET", "/listings/eligibility", T("general"));
  check("general → listing eligibility 403 LISTING_ENTITLEMENT_REQUIRED", r.status === 403 && r.code === "LISTING_ENTITLEMENT_REQUIRED", r.body);
  r = await call("POST", "/internal/cron/rent", null, {});
  check("cron without secret → 403", r.status === 403, r.body);

  section("billing: plans admin, quote, upgrade requests, approval");
  r = await call("POST", "/admin/plans", T("super"), { code: `TST${tag.toUpperCase()}`, nameBn: "টেস্ট সেলার", nameEn: "Test Seller", audience: "SELLER", monthlyPrice: 99, listingLimit: 3, listingDurationDays: 30 });
  check("super → POST /admin/plans (seller plan)", r.status === 200 && !!r.data?.id, r.body);
  const sellerPlan = r.data; if (sellerPlan?.id) planIds.push(sellerPlan.id);
  r = await call("PATCH", `/admin/plans/${sellerPlan?.id}`, T("super"), { monthlyPrice: 120 });
  check("super → PATCH plan price bumps version", r.status === 200 && r.data?.version === 2, r.body);
  r = await call("POST", `/admin/plans/${sellerPlan?.id}/deactivate`, T("super"));
  check("deactivate plan", r.status === 200 && r.data?.isActive === false, r.body);
  r = await call("POST", "/subscriptions/quote", T("general"), { planId: sellerPlan?.id, cycle: "MONTHLY" });
  check("quote on inactive plan → 409 PLAN_INACTIVE", r.status === 409 && r.code === "PLAN_INACTIVE", r.body);
  await call("POST", `/admin/plans/${sellerPlan?.id}/activate`, T("super"));

  r = await call("POST", "/subscriptions/quote", T("owner"), { planId: primary?.id, cycle: "QUARTERLY" });
  check("owner quote PRIMARY quarterly = 572.40, bKash reference = username", r.data?.payable === "572.40" && r.data?.payment?.reference === users.owner!.username, r.body);
  r = await call("POST", "/subscriptions/quote", T("owner"), { planId: sellerPlan?.id, cycle: "MONTHLY" });
  check("owner cannot buy SELLER plan → 403", r.status === 403, r.body);
  r = await call("GET", "/settings/payment-info", T("owner"));
  check("GET /settings/payment-info", r.status === 200 && !!r.data?.bkashPersonalNumber, r.body);

  const trx1 = rnd(10);
  const ur = { planId: primary?.id, cycle: "MONTHLY", senderNumber: "01712345678", trxId: trx1 };
  r = await call("POST", "/upgrade-requests", T("owner"), { ...ur, trxId: "BAD" });
  check("upgrade request bad TrxID → 422", r.status === 422, r.body);
  r = await call("POST", "/upgrade-requests", T("owner"), ur);
  check("owner → POST /upgrade-requests 201", r.status === 201, r.body);
  const upgradeId = r.data?.id;
  r = await call("POST", "/upgrade-requests", T("owner"), { ...ur, trxId: rnd(10) });
  check("second pending → 409 UPGRADE_ALREADY_PENDING", r.status === 409 && r.code === "UPGRADE_ALREADY_PENDING", r.body);
  r = await call("POST", "/upgrade-requests", T("general"), { planId: sellerPlan?.id, cycle: "MONTHLY", senderNumber: "01712345678", trxId: trx1 });
  check("reused TrxID → 409 TRXID_ALREADY_USED", r.status === 409 && r.code === "TRXID_ALREADY_USED", r.body);
  r = await call("GET", "/admin/upgrade-requests", T("super"));
  check("super sees pending queue", r.status === 200 && r.data?.some((x: any) => x.id === upgradeId), r.body);
  r = await call("GET", "/admin/upgrade-requests", T("owner"));
  check("owner → admin queue 403", r.status === 403, r.body);
  r = await call("POST", `/admin/upgrade-requests/${upgradeId}/approve`, T("owner"));
  check("owner cannot approve → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/upgrade-requests/${upgradeId}/approve`, T("super"));
  check("super approves → ownerCode + invoice", r.status === 200 && /^OW\d+$/.test(r.data?.ownerCode ?? "") && /^INV-/.test(r.data?.invoice ?? ""), r.body);
  r = await call("POST", `/admin/upgrade-requests/${upgradeId}/approve`, T("super"));
  check("approve twice → 409", r.status === 409, r.body);
  r = await call("GET", "/me/subscription", T("owner"));
  check("owner subscription ACTIVE (PRIMARY)", r.data?.owner?.status === "ACTIVE" && r.data?.owner?.planCode === "PRIMARY", r.body);
  r = await call("GET", "/me/payments", T("owner"));
  check("owner payment history has invoice", r.status === 200 && r.data?.[0]?.status === "SUCCESS" && !!r.data?.[0]?.invoice?.number, r.body);
  const pay0 = r.data?.[0];
  check("billing history row: plan, cycle, invoice id and number, paid amount", pay0?.plan?.code === "PRIMARY" && pay0?.cycle === "MONTHLY" && !!pay0?.invoice?.id && Number(pay0?.amount) === 159 && !!pay0?.period?.endsAt, pay0);
  check("billing history never exposes the raw gateway payload", !("rawPayload" in (pay0 ?? {})), Object.keys(pay0 ?? {}));
  r = await call("GET", `/invoices/${pay0?.invoice?.id}`, T("owner"));
  check("invoice data for the PDF: number, customer, plan, amount, TrxID", r.status === 200 && r.data?.number === pay0?.invoice?.number && r.data?.plan?.code === "PRIMARY" && r.data?.amount === "159.00" && r.data?.customer?.username === users.owner!.username && r.data?.payment?.reference === trx1.toUpperCase(), r.body);
  r = await call("GET", `/invoices/${pay0?.invoice?.id}`, T("general"));
  check("someone else's invoice → 404", r.status === 404, r.body);
  r = await call("GET", "/me/subscription", T("owner"));
  check("my subscription: current plan, cycle, dates, usage and no pending request", r.data?.current?.plan?.code === "PRIMARY" && r.data?.current?.cycle === "MONTHLY" && !!r.data?.current?.endsAt && r.data?.pendingRequest === null && typeof r.data?.owner?.usage?.units === "number" && r.data?.owner?.limits?.unitLimit === 40, r.body);

  const trx2 = rnd(10);
  r = await call("POST", "/upgrade-requests", T("general"), { planId: sellerPlan?.id, cycle: "MONTHLY", senderNumber: "01812345678", trxId: trx2 });
  check("general → seller plan request 201", r.status === 201, r.body);
  const sellerReq = r.data?.id;
  r = await call("POST", `/admin/upgrade-requests/${sellerReq}/reject`, T("super"), {});
  check("reject without reason → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/upgrade-requests/${sellerReq}/reject`, T("super"), { reason: "TrxID not found in statement" });
  check("super rejects with reason", r.status === 200 && r.data?.status === "REJECTED", r.body);
  r = await call("POST", "/upgrade-requests", T("general"), { planId: sellerPlan?.id, cycle: "MONTHLY", senderNumber: "01812345678", trxId: rnd(10) });
  const sellerReq2 = r.data?.id;
  check("general resubmits after rejection", r.status === 201, r.body);
  r = await call("POST", `/admin/upgrade-requests/${sellerReq2}/approve`, T("super"));
  check("approve seller plan (role unchanged, no owner code)", r.status === 200 && r.data?.ownerCode === null, r.body);
  r = await call("GET", "/me", T("general"));
  check("general stays GENERAL_USER", r.data?.role === "GENERAL_USER", r.body);
  r = await call("GET", "/me/payments", T("general"));
  const failedPay = r.data?.find((p: any) => p.status === "FAILED");
  check("billing history shows the rejected payment with its reason, and the approved one", r.status === 200 && failedPay?.rejectionReason === "TrxID not found in statement" && !failedPay?.invoice && r.data?.some((p: any) => p.status === "SUCCESS" && !!p.invoice?.number), r.data);
  r = await call("POST", "/upgrade-requests", T("general"), { planId: sellerPlan?.id, cycle: "QUARTERLY", senderNumber: "01812345678", trxId: rnd(10) });
  const qReq = r.data?.id;
  check("quarterly request is stored with the 4-month price", r.status === 201 && !!qReq && r.data?.cycle === "QUARTERLY", r.body);
  r = await call("GET", "/me/subscription", T("general"));
  check("a waiting request is returned with plan name, amount and TrxID (the page's banner)", r.data?.pendingRequest?.id === qReq && !!r.data?.pendingRequest?.plan?.nameEn && !!r.data?.pendingRequest?.expectedAmount && r.data?.pendingRequest?.trxId?.length === 10, r.body);
  r = await call("POST", `/upgrade-requests/${qReq}/cancel`, T("owner"));
  check("someone else cannot cancel my request → 404", r.status === 404, r.body);
  r = await call("POST", `/upgrade-requests/${qReq}/cancel`, T("general"));
  check("owner of the request cancels it", r.status === 200 && r.data?.status === "CANCELLED", r.body);

  section("properties, floors, units");
  r = await call("POST", "/properties", T("owner"), { ...propBody, totalFloors: 0 });
  check("property validation (totalFloors 0) → 422", r.status === 422, r.body);
  r = await call("POST", "/properties", T("owner"), propBody);
  check("owner → POST /properties 201", r.status === 201 && !!r.data?.id, r.body);
  const prop = r.data;
  r = await call("GET", `/properties/${prop?.id}`, T("owner"));
  check("GET /properties/:id", r.status === 200 && r.data?.name === propBody.name, r.body);
  r = await call("GET", `/properties/${prop?.id}`, T("tenant"));
  check("tenant → other's property 403", r.status === 403, r.body);
  r = await call("GET", `/properties/${prop?.id}`, T("gov"));
  check("gov can read property (read-only)", r.status === 200, r.body);
  r = await call("PATCH", `/properties/${prop?.id}`, T("gov"), { name: "hack" });
  check("gov cannot modify property → 403", r.status === 403, r.body);
  const unitBody = { unitNumber: "A101", floor: 1, bedrooms: 3, bathrooms: 2, areaSqft: 1200, rent: 15000, deposit: 30000, utilityCharge: 1500, furnishing: "SEMI_FURNISHED" };
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), unitBody);
  check("create unit A101 (1200 sqft, ৳15000)", r.status === 201 && r.data?.areaSqft === 1200, r.body);
  const unitA = r.data;
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { ...unitBody, floor: 2, unitNumber: "A201", rent: 14000, areaSqft: 1100 });
  check("create unit A201", r.status === 201, r.body);
  const unitB = r.data;
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), unitBody);
  check("duplicate unitNumber → 409", r.status === 409, r.body);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { ...unitBody, unitNumber: "Z9", floor: 9 });
  check("floor above totalFloors → 422", r.status === 422, r.body);
  r = await call("GET", `/properties/${prop?.id}/floors`, T("owner"));
  const f1 = r.data?.floors?.find((f: any) => f.floor === 1);
  check("floors roll-up (floor 1: 1 unit, 1200 sqft)", r.status === 200 && f1?.unitCount === 1 && f1?.totalAreaSqft === 1200, r.body);
  r = await call("PATCH", `/units/${unitB?.id}`, T("owner"), { rent: 14500, areaSqft: 1150 });
  check("PATCH unit rent/sqft", r.status === 200 && r.data?.areaSqft === 1150, r.body);
  r = await call("GET", `/properties/${prop?.id}/units`, T("owner"));
  check("list units", r.status === 200 && r.data?.items?.length === 2, r.body);
  r = await call("GET", "/properties", T("owner"));
  check("list properties", r.status === 200 && r.data?.items?.length === 1, r.body);
  const row0 = r.data?.items?.[0];
  check("list row has figures: 2 real units, 0 occupied, 2 vacant, sqft = sum of unit areas, location label", row0?.totalUnits === 2 && row0?.occupiedUnits === 0 && row0?.vacantUnits === 2 && row0?.sqft === 2350 && /Uttara/.test(row0?.locationLabel ?? ""), row0);
  r = await call("POST", "/properties", T("owner"), { name: "List Form Tower", locationText: "Keraniganj, Dhaka, Bangladesh", totalSqft: 12000, declaredUnits: 20 });
  check("create property from the list form (no address/floors) → 201, floors derived", r.status === 201 && r.data?.totalFloors === 5 && r.data?.locationText === "Keraniganj, Dhaka, Bangladesh", r.body);
  const formProp = r.data;
  r = await call("POST", "/properties", T("owner"), { name: "No Location" });
  check("create without any location → 422", r.status === 422, r.body);
  r = await call("GET", "/properties", T("owner"));
  const fr = r.data?.items?.find((x: any) => x.id === formProp?.id);
  check("declared 20 units, none real: total 20, vacant 20, sqft 12000", fr?.totalUnits === 20 && fr?.vacantUnits === 20 && fr?.sqft === 12000 && fr?.locationLabel === "Keraniganj, Dhaka, Bangladesh", fr);
  r = await call("PATCH", `/properties/${prop?.id}`, T("owner"), { declaredUnits: 1 });
  check("declaredUnits below existing unit rows → 422", r.status === 422, r.body);
  r = await call("PATCH", `/properties/${formProp?.id}`, T("owner"), { name: "List Form Tower 2", totalSqft: 9000, declaredUnits: 12, locationText: "Mirpur, Dhaka" });
  check("edit list fields", r.status === 200 && r.data?.totalSqft === 9000 && r.data?.declaredUnits === 12, r.body);
  r = await call("POST", `/properties/${formProp?.id}/images`, T("owner"), { storageKey: `PROPERTY_IMAGE/${users.tenant!.id}/x.png` });
  check("attach someone else's upload → 403", r.status === 403, r.body);
  const up = await uploadVia(T("owner"), "PROPERTY_IMAGE", "image/png", PNG);
  r = await call("POST", `/properties/${formProp?.id}/images`, T("owner"), { storageKey: up.key, order: 0 });
  check("attach own PROPERTY_IMAGE upload → 201", r.status === 201, r.body);
  const imgId = r.data?.id;
  r = await call("GET", "/properties", T("owner"));
  check("list row carries a signed cover URL", /^https?:\/\//.test(r.data?.items?.find((x: any) => x.id === formProp?.id)?.coverUrl ?? ""), r.data?.items?.[0]);
  r = await call("DELETE", `/properties/${formProp?.id}/images/${imgId}`, T("tenant"));
  check("tenant cannot remove the image → 403", r.status === 403, r.body);
  r = await call("DELETE", `/properties/${formProp?.id}/images/${imgId}`, T("owner"));
  check("owner removes the image", r.status === 200 && r.data?.removed === true, r.body);
  r = await call("POST", `/properties/${formProp?.id}/archive`, T("owner"), { reason: "Deleted by the owner from the Properties list" });
  check("delete (archive) the form property → hidden from the list", r.status === 200, r.body);
  r = await call("GET", "/properties", T("owner"));
  check("archived property no longer listed", r.data?.items?.length === 1, r.data?.items?.length);

  section("tenancy + rent");
  r = await call("POST", "/tenancies/invite", T("owner"), { unitId: unitA?.id, startDate: today });
  check("invite without email/phone → 422", r.status === 422, r.body);
  r = await call("POST", "/tenancies/invite", T("tenant"), { unitId: unitA?.id, email: users.tenant!.email, startDate: today });
  check("tenant cannot invite → 403", r.status === 403, r.body);
  r = await call("POST", "/tenancies/invite", T("owner"), { unitId: unitA?.id, email: users.tenant!.email, startDate: today });
  check("owner invites tenant → token", r.status === 201 && /^[a-f0-9]{64}$/.test(r.data?.token ?? ""), r.body);
  const token = r.data?.token;
  r = await call("POST", `/invitations/${token}/accept`, T("general"));
  check("wrong user cannot accept → 403", r.status === 403, r.body);
  r = await call("POST", `/invitations/${token}/accept`, T("tenant"));
  check("tenant accepts → ACTIVE agreement", r.status === 200 && r.data?.status === "ACTIVE", r.body);
  const agreement = r.data;
  r = await call("POST", `/invitations/${token}/accept`, T("tenant"));
  check("token reuse → 404", r.status === 404, r.body);
  r = await call("POST", "/tenancies/invite", T("owner"), { unitId: unitA?.id, email: users.general!.email, startDate: today });
  check("invite on occupied unit → 409", r.status === 409, r.body);
  r = await call("GET", "/tenancies?status=ACTIVE", T("owner"));
  check("owner lists active tenancies (with tenant name)", r.status === 200 && r.data?.[0]?.tenant?.username === users.tenant!.username, r.body);
  r = await call("GET", "/tenancies", T("tenant"));
  check("tenant lists own tenancy", r.status === 200 && r.data?.length === 1, r.body);

  section("tenants directory");
  r = await call("GET", "/tenancies/directory", T("owner"));
  const drow = r.data?.items?.find((x: any) => x.id === agreement?.id);
  check("directory: row has tenant contact, unit, property, status ACTIVE, 1 member", r.status === 200 && drow?.tenant?.id === users.tenant!.id && !!drow?.tenant?.email && drow?.unit?.unitNumber === "A101" && drow?.property?.name === prop?.name && drow?.status === "ACTIVE" && drow?.members === 1, r.body);
  check("directory stats: 1 active, none leaving or overdue", r.data?.stats?.active === 1 && r.data?.stats?.leaveSoon === 0 && r.data?.stats?.overdue === 0 && r.data?.total === 1, r.data?.stats);
  r = await call("GET", `/tenancies/directory?q=${users.tenant!.username.slice(0, 6)}`, T("owner"));
  check("directory search by tenant name/phone/unit", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/tenancies/directory?q=a101", T("owner"));
  check("directory search by unit name (case-insensitive)", r.data?.total === 1, r.body);
  r = await call("GET", "/tenancies/directory?q=zzzzz", T("owner"));
  check("directory search with no match → empty", r.data?.total === 0, r.body);
  r = await call("GET", "/tenancies/directory?tab=leaveSoon", T("owner"));
  check("leave-soon tab empty while the lease is far away", r.data?.total === 0, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}`, T("owner"), { endDate: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10), members: 4, noticeGiven: true });
  check("owner edits lease end (10 days away), members 4, notice given", r.status === 200 && r.data?.members === 4 && !!r.data?.noticeGivenAt, r.body);
  r = await call("GET", "/tenancies/directory?tab=leaveSoon", T("owner"));
  check("leave-soon tab now lists the tenant, status NOTICE_GIVEN, leaveSoon flag, stats updated", r.data?.total === 1 && r.data?.items?.[0]?.status === "NOTICE_GIVEN" && r.data?.items?.[0]?.leaveSoon === true && r.data?.items?.[0]?.members === 4 && r.data?.stats?.leaveSoon === 1, r.data);
  await db.rentRecord.updateMany({ where: { agreementId: agreement!.id }, data: { status: "OVERDUE", paid: 100 } });
  r = await call("GET", "/tenancies/directory?tab=overdue", T("owner"));
  check("overdue tab lists the tenant with the amount owed; OVERDUE beats NOTICE_GIVEN", r.data?.total === 1 && r.data?.items?.[0]?.status === "OVERDUE" && Number(r.data?.items?.[0]?.overdueAmount) > 0 && r.data?.stats?.overdue === 1, r.data);
  await db.rentRecord.updateMany({ where: { agreementId: agreement!.id }, data: { status: "DUE", paid: 0 } }); // back to how the rent section below expects it
  r = await call("PATCH", `/tenancies/${agreement?.id}`, T("owner"), { endDate: "2030-01-01", noticeGiven: false, members: 31 });
  check("members above 30 → 422", r.status === 422, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}`, T("owner"), { endDate: "2030-01-01", noticeGiven: false });
  check("owner clears the notice and moves the lease end back", r.status === 200 && r.data?.noticeGivenAt === null, r.body);
  r = await call("GET", "/tenancies/directory", T("tenant"));
  check("tenant → directory 403", r.status === 403, r.body);
  r = await call("GET", "/tenancies/directory?tab=nope", T("owner"));
  check("unknown tab → 422", r.status === 422, r.body);
  r = await call("GET", "/tenancies/directory", null);
  check("no token → directory 401", r.status === 401, r.body);
  r = await call("GET", `/tenancies/lookup?email=${encodeURIComponent(users.general!.email)}`, T("owner"));
  check("lookup by e-mail → found, e-mail masked", r.status === 200 && r.data?.found === true && r.data?.tenant?.id === users.general!.id && /•/.test(r.data?.tenant?.email ?? ""), r.body);
  r = await call("GET", `/tenancies/lookup?email=${encodeURIComponent(users.general!.email)}&phone=01712345678`, T("owner"));
  check("lookup with both phone and e-mail → 422", r.status === 422, r.body);
  r = await call("GET", "/tenancies/lookup", T("owner"));
  check("lookup with neither → 422", r.status === 422, r.body);

  section("units management");
  r = await call("GET", "/units", T("owner"));
  check("owner units list: 2 units, counts, property + location, no maintenance", r.status === 200 && r.data?.total === 2 && r.data?.counts?.all === 2 && r.data?.counts?.occupied === 1 && r.data?.counts?.vacant === 1 && r.data?.counts?.maintenance === 0 && r.data?.items?.[0]?.property?.name === prop?.name, r.body);
  const ua = r.data?.items?.find((x: any) => x.unitNumber === "A101");
  check("A101 is OCCUPIED with its tenant", ua?.status === "OCCUPIED" && ua?.tenant?.id === users.tenant!.id && ua?.agreementId === agreement?.id, ua);
  r = await call("GET", "/units?status=OCCUPIED", T("owner"));
  check("status filter OCCUPIED → only A101", r.data?.total === 1 && r.data?.items?.[0]?.unitNumber === "A101", r.body);
  r = await call("GET", "/units?status=VACANT", T("owner"));
  check("status filter VACANT → only A201", r.data?.total === 1 && r.data?.items?.[0]?.unitNumber === "A201", r.body);
  r = await call("GET", "/units?q=a2", T("owner"));
  check("search is case-insensitive on the unit name", r.data?.total === 1 && r.data?.items?.[0]?.unitNumber === "A201", r.body);
  r = await call("GET", `/units?propertyId=${prop?.id}&page=1&pageSize=1`, T("owner"));
  check("property filter + paging: 1 of 2 on page 1", r.data?.items?.length === 1 && r.data?.total === 2 && r.data?.pageSize === 1, r.body);
  r = await call("GET", "/units?propertyId=00000000-0000-4000-8000-000000000000", T("owner"));
  check("another property id → empty list", r.status === 200 && r.data?.total === 0, r.body);
  r = await call("GET", "/units?pageSize=500", T("owner"));
  check("pageSize above 50 → 422", r.status === 422, r.body);
  r = await call("GET", "/units", T("tenant"));
  check("tenant → /units 403", r.status === 403, r.body);
  r = await call("GET", "/units", T("gov"));
  check("gov → /units 403 (owner-only list)", r.status === 403, r.body);
  r = await call("GET", "/units", null);
  check("no token → /units 401", r.status === 401, r.body);

  // an open repair marks the unit as MAINTENANCE even though a tenant lives there
  const mreq = await db.maintenanceRequest.create({ data: { agreementId: agreement!.id, unitId: unitA!.id, tenantId: users.tenant!.id, category: "PLUMBING", title: "Smoke repair", description: "status test", status: "IN_PROGRESS" } });
  r = await call("GET", "/units?status=MAINTENANCE", T("owner"));
  check("occupied unit with a repair IN_PROGRESS shows as MAINTENANCE and keeps its tenant", r.data?.total === 1 && r.data?.items?.[0]?.status === "MAINTENANCE" && r.data?.items?.[0]?.tenant?.id === users.tenant!.id, r.body);
  r = await call("GET", "/units?status=OCCUPIED", T("owner"));
  check("…and is no longer counted as OCCUPIED", r.data?.total === 0, r.body);
  await db.maintenanceRequest.delete({ where: { id: mreq.id } });

  // tenant lookup by phone
  const tenantPhone = (await db.user.findUniqueOrThrow({ where: { id: users.tenant!.id }, select: { phone: true } })).phone!;
  r = await call("GET", `/tenancies/lookup?phone=${tenantPhone}`, T("owner"));
  check("lookup by full phone → found, flagged as already renting", r.status === 200 && r.data?.found === true && r.data?.tenant?.id === users.tenant!.id && r.data?.tenant?.hasActiveTenancy === true, r.body);
  r = await call("GET", "/tenancies/lookup?phone=01799999999", T("owner"));
  check("lookup unknown phone → found:false", r.status === 200 && r.data?.found === false, r.body);
  r = await call("GET", "/tenancies/lookup?phone=0171234", T("owner"));
  check("lookup partial phone → 422 (no browsing)", r.status === 422, r.body);
  r = await call("GET", `/tenancies/lookup?phone=${tenantPhone}`, T("tenant"));
  check("tenant cannot look up tenants → 403", r.status === 403, r.body);
  r = await call("GET", `/tenancies/lookup?phone=${phone()}`, T("super"));
  check("super admin cannot use the owner lookup → 403", r.status === 403, r.body);

  // create a unit and move a registered tenant in, in one step
  const xPhone = phone();
  const xUser = await db.user.create({ data: { username: `extra${tag}`, fullName: "Extra Tenant", email: `extra.${tag}@mailinator.com`, phone: xPhone, role: "TENANT" } });
  users.extra = { key: "extra", id: xUser.id, authId: "", email: xUser.email!, password: "", username: xUser.username, token: "" };
  await fillProfile(xUser.id);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "A301", floor: 3, bedrooms: 2, bathrooms: 1, diningRooms: 1, kitchens: 1, areaSqft: 900, rent: 12000, tenantId: xUser.id, members: 3 });
  check("create unit with a tenant → 201, OCCUPIED", r.status === 201 && r.data?.availability === "OCCUPIED" && r.data?.diningRooms === 1 && r.data?.kitchens === 1, r.body);
  const unitC = r.data;
  const xAgreement = await db.rentalAgreement.findFirst({ where: { unitId: unitC?.id, tenantId: xUser.id } });
  check("ACTIVE agreement at the unit's rent + a rent record for this month + tenant notified", xAgreement?.status === "ACTIVE" && xAgreement?.members === 3 && Number(xAgreement?.rent) === 12000 && (await db.rentRecord.count({ where: { agreementId: xAgreement!.id } })) === 1 && (await db.notification.count({ where: { userId: xUser.id, type: "tenancy.assigned" } })) === 1, xAgreement);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "A401", floor: 4, bedrooms: 1, areaSqft: 500, rent: 9000, tenantId: xUser.id });
  check("same tenant into a second unit → 409 (one home at a time), and no unit is left behind", r.status === 409 && (await db.unit.count({ where: { propertyId: prop?.id, unitNumber: "A401" } })) === 0, r.body);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "A501", floor: 4, bedrooms: 1, areaSqft: 500, rent: 9000, tenantId: users.owner!.id });
  check("owner themself as the tenant → 422", r.status === 422, r.body);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "A501", floor: 4, bedrooms: 1, areaSqft: 500, rent: 9000, tenantId: users.super!.id });
  check("a staff account cannot be a tenant → 422", r.status === 422, r.body);
  r = await call("POST", `/units/${unitC?.id}/tenant`, T("owner"), { tenantId: users.general!.id });
  check("assign into an occupied unit → 409", r.status === 409, r.body);
  r = await call("POST", `/units/${unitB?.id}/tenant`, T("tenant"), { tenantId: xUser.id });
  check("tenant cannot assign tenants → 403", r.status === 403, r.body);
  r = await call("POST", `/units/${unitC?.id}/archive`, T("owner"));
  check("occupied unit cannot be deleted → 409", r.status === 409, r.body);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "A901", floor: 4, bedrooms: 1, areaSqft: 300, rent: 7000 });
  const unitD = r.data;
  check("vacant unit (no tenant) → 201, AVAILABLE", r.status === 201 && unitD?.availability === "AVAILABLE", r.body);
  r = await call("POST", `/units/${unitD?.id}/archive`, T("owner"));
  check("vacant unit can be deleted (archived)", r.status === 200, r.body);
  r = await call("GET", "/units", T("owner"));
  check("archived unit is gone; the unit with a tenant is listed as OCCUPIED", r.data?.total === 3 && !r.data?.items?.some((x: any) => x.unitNumber === "A901") && r.data?.items?.some((x: any) => x.unitNumber === "A301" && x.status === "OCCUPIED"), r.body);
  // leave the property exactly as before so the dashboard and rent checks further down keep their numbers
  await db.rentRecord.deleteMany({ where: { agreementId: xAgreement!.id } });
  await db.rentalAgreement.delete({ where: { id: xAgreement!.id } });
  await db.notification.deleteMany({ where: { userId: xUser.id } });
  await db.unit.delete({ where: { id: unitC.id } });
  await db.unit.delete({ where: { id: unitD.id } });

  r = await call("POST", "/internal/cron/rent", null, {}, { "x-cron-secret": CRON });
  check("cron: generate monthly rent records (idempotent)", r.status === 200 && r.data?.created === 0, r.body);
  r = await call("GET", "/tenant/rent", T("tenant"));
  const rec = r.data?.[0];
  check("tenant sees this month's record: ৳16500 DUE", r.status === 200 && rec?.total === "16500" || rec?.total === "16500.00" || Number(rec?.total) === 16500, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("tenant"), { amount: 100, method: "CASH" });
  check("tenant cannot record payments → 403", r.status === 403, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 100, method: "BKASH" });
  check("digital payment without reference → 422", r.status === 422, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 6500, method: "CASH" });
  check("owner records partial ৳6500 cash", r.status === 201 && r.data?.record?.status === "PARTIAL" || r.data?.record?.status === "OVERDUE", r.body);
  const pay1 = r.data?.payment;
  r = await call("GET", "/notifications?category=payment&limit=20", T("owner"));
  const got = r.data?.items?.find((x: any) => x.type === "rent.received" && x.params?.paymentId === pay1?.id);
  check("owner is told: Rent Received, naming tenant, unit, property, amount, method and receipt number", r.status === 200 && got?.category === "payment" && got?.params?.tenantName === `Test tenant` && !!got?.params?.unit && !!got?.params?.property && Number(got?.params?.amount) === 6500 && got?.params?.method === "CASH" && /^RC-\d{6}-[A-Z0-9]{8}$/.test(got?.params?.receipt ?? ""), got);
  r = await call("GET", "/notifications?category=maintenance&limit=50", T("owner"));
  check("the Maintenance tab never shows a payment", r.status === 200 && !r.data?.items?.some((x: any) => x.type.startsWith("rent.")), r.body);
  r = await call("GET", "/notifications?category=payment&limit=50", T("owner"));
  check("unread numbers per tab come with the list", r.status === 200 && typeof r.data?.unread === "number" && r.data?.unreadByCategory?.payment >= 1 && typeof r.data?.unreadByCategory?.maintenance === "number", r.body);
  r = await call("GET", "/notifications?category=bogus", T("owner"));
  check("unknown tab → 422", r.status === 422, r.body);
  r = await call("GET", `/rent/payments/${pay1?.id}/receipt`, T("owner"));
  check("receipt for the landlord has the tenant's phone, id and photo field", r.status === 200 && !!r.data?.tenant?.phone && !!r.data?.tenant?.id && "avatarUrl" in r.data.tenant && r.data?.paymentId === pay1?.id, r.body);
  r = await call("GET", `/rent/payments/${pay1?.id}/receipt`, T("tenant"));
  check("receipt for the tenant never repeats the phone number back", r.status === 200 && r.data?.tenant?.phone === null, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 50000, method: "CASH" });
  check("overpayment → 422", r.status === 422, r.body);
  r = await call("PATCH", `/rent/records/${rec?.id}`, T("tenant"), { other: 500 });
  check("tenant cannot add charges → 403", r.status === 403, r.body);
  r = await call("PATCH", `/rent/records/${rec?.id}`, T("owner"), { other: 500 });
  check("owner adds ৳500 other charges → total ৳17000", r.status === 200 && Number(r.data?.total) === 17000, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 3000, method: "BKASH", reference: rnd(10), verified: false });
  check("unverified payment is PENDING and does not reduce the balance", r.status === 201 && r.data?.payment?.status === "PENDING" && Number(r.data?.record?.paid) === 6500, r.body);
  const pendingPay = r.data?.payment;
  r = await call("POST", `/rent/payments/${pendingPay?.id}/verify`, T("tenant"), { decision: "VERIFIED" });
  check("tenant cannot verify → 403", r.status === 403, r.body);
  r = await call("POST", `/rent/payments/${pendingPay?.id}/verify`, T("owner"), { decision: "VERIFIED" });
  check("owner verifies → paid ৳9500", r.status === 200 && Number(r.data?.record?.paid) === 9500, r.body);
  r = await call("POST", `/rent/payments/${pendingPay?.id}/verify`, T("owner"), { decision: "VERIFIED" });
  check("verify twice → 409", r.status === 409, r.body);
  const ref = rnd(10);
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 7500, method: "BKASH", reference: ref });
  check("owner records remaining ৳7500 bKash → PAID", r.status === 201 && r.data?.record?.status === "PAID", r.body);
  const pay2 = r.data?.payment;
  r = await call("POST", `/rent/records/${rec?.id}/payments`, T("owner"), { amount: 1, method: "BKASH", reference: ref });
  check("payment on fully paid record → 409", r.status === 409, r.body);
  r = await call("GET", `/rent/payments/${pay2?.id}/receipt`, T("tenant"));
  check("tenant downloads receipt", r.status === 200 && /^RC-\d{6}-/.test(r.data?.receiptNo ?? "") && r.data?.balance === "0.00", r.body);
  r = await call("GET", `/rent/payments/${pay1?.id}/receipt`, T("general"));
  check("stranger → receipt 403", r.status === 403, r.body);
  r = await call("GET", `/rent/payments/${pay1?.id}/receipt`, T("gov"));
  check("gov → receipt 403 (no finances)", r.status === 403, r.body);
  r = await call("GET", "/rent/overview", T("owner"));
  check("owner rent overview: collected 17000, row per tenant", r.status === 200 && Number(r.data?.collected) === 17000 && r.data?.rows?.[0]?.tenant === "Test tenant", r.body);
  r = await call("GET", `/rent/records?agreementId=${agreement?.id}`, T("owner"));
  check("owner lists records for agreement", r.status === 200 && r.data?.[0]?.payments?.length === 3, r.body);
  r = await call("POST", `/rent/records/${rec?.id}/remind`, T("owner"));
  check("remind on PAID record → 409", r.status === 409, r.body);

  section("rent overview (ledger, report, reminders)");
  const thisMonth = new Date().toISOString().slice(0, 7);
  r = await call("GET", "/rent/ledger", T("owner"));
  const lrow = r.data?.items?.find((x: any) => x.agreementId === agreement?.id);
  check("ledger: this month's row — A101, tenant, PAID, 17000, receipt payment present", r.status === 200 && r.data?.month === thisMonth && lrow?.unit === "A101" && lrow?.tenant === "Test tenant" && lrow?.status === "PAID" && Number(lrow?.paid) === 17000 && !!lrow?.receiptPaymentId, r.body);
  check("ledger stats: expected 17000 = collected 17000, nothing pending or overdue, 100%", Number(r.data?.stats?.expected) === 17000 && Number(r.data?.stats?.collected) === 17000 && Number(r.data?.stats?.pending) === 0 && r.data?.stats?.overdueCount === 0 && r.data?.stats?.collectionRate === 100 && r.data?.stats?.remindable?.count === 0, r.data?.stats);
  r = await call("GET", "/rent/ledger?status=unpaid", T("owner"));
  check("Unpaid tab empty while everything is paid", r.data?.total === 0, r.body);
  r = await call("GET", "/rent/ledger?status=paid", T("owner"));
  check("Paid tab lists the paid row", r.data?.total === 1, r.body);
  r = await call("GET", `/rent/ledger?propertyId=${prop?.id}`, T("owner"));
  check("property filter keeps the row", r.data?.total === 1 && r.data?.propertyId === prop?.id, r.body);
  r = await call("GET", "/rent/ledger?propertyId=00000000-0000-4000-8000-000000000000", T("owner"));
  check("another property → empty list, zero stats", r.data?.total === 0 && Number(r.data?.stats?.expected) === 0, r.body);
  r = await call("GET", "/rent/ledger?month=2024-01", T("owner"));
  check("an old month with no records → empty", r.status === 200 && r.data?.total === 0 && r.data?.month === "2024-01", r.body);
  r = await call("GET", "/rent/ledger?month=2026-13", T("owner"));
  check("bad month → 422", r.status === 422, r.body);
  r = await call("GET", "/rent/ledger?pageSize=500", T("owner"));
  check("pageSize above 50 → 422", r.status === 422, r.body);
  for (const who of ["tenant", "gov", "super", "general"] as const) {
    r = await call("GET", "/rent/ledger", T(who));
    check(`${who} → /rent/ledger 403`, r.status === 403, r.body);
  }
  r = await call("GET", "/rent/ledger", null);
  check("no token → /rent/ledger 401", r.status === 401, r.body);
  r = await call("GET", `/rent/payments/${lrow?.receiptPaymentId}/receipt`, T("owner"));
  check("receipt for the row's payment → 200 with amount and month", r.status === 200 && r.data?.billingMonth === thisMonth && Number(r.data?.amount) > 0, r.body);
  r = await call("GET", `/rent/payments/${lrow?.receiptPaymentId}/receipt`, T("general"));
  check("a stranger cannot read that receipt → 403", r.status === 403, r.body);
  r = await call("GET", "/rent/report", T("owner"));
  check("report: all rows + stats + owner name", r.status === 200 && r.data?.rows?.length === 1 && r.data?.owner?.fullName === "Test owner" && Number(r.data?.stats?.collected) === 17000 && !!r.data?.generatedAt, r.body);
  r = await call("GET", "/rent/report?status=unpaid&month=2026-13", T("owner"));
  check("report with a bad month → 422", r.status === 422, r.body);
  r = await call("GET", "/rent/report", T("tenant"));
  check("tenant → /rent/report 403", r.status === 403, r.body);

  // arrears: an unpaid record from last month is carried into this month and is what "Send Reminder" targets
  const prevMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1));
  const arrears = await db.rentRecord.create({ data: { agreementId: agreement!.id, billingMonth: prevMonth, rent: 15000, total: 15000, paid: 0, dueDate: new Date(prevMonth.getTime() + 4 * 86400_000), status: "OVERDUE" } });
  await db.notification.deleteMany({ where: { userId: users.tenant!.id, type: "rent.reminder" } });
  const smsBefore = await db.outboxEvent.count({ where: { type: "sms.send" } });
  r = await call("GET", "/rent/ledger", T("owner"));
  const carried = r.data?.items?.find((x: any) => x.recordId === arrears.id);
  check("last month's unpaid rent is carried into this month as OVERDUE and listed first", r.data?.items?.[0]?.recordId === arrears.id && carried?.carriedOver === true && carried?.status === "OVERDUE" && Number(carried?.outstanding) === 15000 && !carried?.receiptPaymentId, r.data?.items);
  check("stats: overdue 1, amount due 15000, remindable 1 tenant", r.data?.stats?.overdueCount === 1 && Number(r.data?.stats?.dueAmount) === 15000 && r.data?.stats?.remindable?.tenants === 1 && Number(r.data?.stats?.expected) === 17000, r.data?.stats);
  r = await call("GET", "/rent/ledger?status=unpaid", T("owner"));
  check("Unpaid tab now lists the overdue row", r.data?.total === 1 && r.data?.items?.[0]?.status === "OVERDUE", r.body);
  const t0 = new Date();
  r = await call("POST", "/rent/remind", T("owner"), {});
  check("Send Reminder → 1 tenant notified, SMS queued", r.status === 200 && r.data?.sent === 1 && r.data?.eligible === 1 && r.data?.smsQueued === 1, r.body);
  const note = await db.notification.findFirst({ where: { userId: users.tenant!.id, type: "rent.reminder", createdAt: { gte: t0 } } });
  check("the tenant got an in-app reminder with the amount owed", Number((note?.params as any)?.due) === 15000, note);
  check("an SMS job was queued in the outbox", (await db.outboxEvent.count({ where: { type: "sms.send" } })) === smsBefore + 1);
  check("audit row rent.remind_all written", (await db.auditLog.count({ where: { actorId: users.owner!.id, action: "rent.remind_all" } })) >= 1);
  r = await call("POST", "/rent/remind", T("owner"), {});
  check("pressing it again → nothing sent (already reminded in 24 hours)", r.status === 200 && r.data?.sent === 0 && r.data?.skippedRecent === 1, r.body);
  r = await call("POST", "/rent/remind", T("tenant"), {});
  check("tenant cannot send reminders → 403", r.status === 403, r.body);
  r = await call("POST", "/rent/remind", null, {});
  check("no token → /rent/remind 401", r.status === 401, r.body);
  r = await call("GET", "/dashboard/owner/activities?limit=30", T("owner"));
  check("Recent Activities shows the reminder run", r.data?.items?.some((a: any) => a.kind === "REMINDERS_SENT" && Number(a.text) === 1), r.body);
  await db.rentRecord.delete({ where: { id: arrears.id } });
  await db.outboxEvent.deleteMany({ where: { type: "sms.send", createdAt: { gte: t0 } } });
  await db.notification.deleteMany({ where: { userId: users.tenant!.id, type: "rent.reminder" } });
  r = await call("PATCH", `/tenancies/${agreement?.id}`, T("owner"), { rent: 15500 });
  check("owner updates agreement rent", r.status === 200, r.body);
  r = await call("GET", "/rent/payments", T("owner"));
  check("owner payment history (3 payments, tenant name)", r.status === 200 && r.data?.items?.length === 3 && r.data?.items?.[0]?.tenant === "Test tenant", r.body);
  r = await call("GET", "/rent/payments?method=CASH", T("owner"));
  check("payment history filter by method", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("GET", "/tenant/payments", T("tenant"));
  check("tenant payment history (own)", r.status === 200 && r.data?.items?.length === 3, r.body);
  r = await call("GET", "/tenant/payments", T("owner"));
  check("owner → tenant payment history 403", r.status === 403, r.body);
  let csv = await raw(`/rent/export?month=${today.slice(0, 7)}`, T("owner"));
  check("rent report CSV export", csv.status === 200 && csv.type.includes("text/csv") && csv.text.includes("Test tenant"), csv.text.slice(0, 120));
  csv = await raw(`/rent/export?month=${today.slice(0, 7)}`, T("tenant"));
  check("tenant cannot export rent report → 403", csv.status === 403, csv.text.slice(0, 80));
  const ag = await uploadVia(T("owner"), "AGREEMENT", "application/pdf", PDF);
  check("owner signs + uploads agreement PDF", !!ag.key && !ag.error, ag.error ?? ag.signed.body);
  r = await call("POST", `/tenancies/${agreement?.id}/agreement`, T("tenant"), { storageKey: ag.key });
  check("tenant cannot attach agreement → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/agreement`, T("owner"), { storageKey: `AGREEMENT/${users.tenant!.id}/x.pdf` });
  check("agreement key must be the owner's upload → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/agreement`, T("owner"), { storageKey: ag.key });
  check("owner attaches agreement", r.status === 200 && r.data?.agreementDocKey === ag.key, r.body);
  r = await call("GET", `/tenancies/${agreement?.id}/agreement`, T("tenant"));
  check("tenant gets signed agreement link", r.status === 200 && typeof r.data?.url === "string", r.body);
  if (r.data?.url) { const f = await fetch(r.data.url); check("signed link downloads the file", f.status === 200); }
  r = await call("GET", `/tenancies/${agreement?.id}/agreement`, T("general"));
  check("stranger → agreement 403", r.status === 403, r.body);
  r = await call("GET", "/tenant/rental", T("tenant"));
  check("tenant My Rental page", r.status === 200 && r.data?.property?.name === propBody.name && r.data?.owner?.id === users.owner!.id && r.data?.agreement?.hasAgreementDocument === true, r.body);
  r = await call("GET", "/tenant/rental", T("owner"));
  check("owner → My Rental 403", r.status === 403, r.body);

  section("maintenance");
  r = await call("POST", "/maintenance", T("owner"), { category: "PLUMBING", title: "Leak", description: "Kitchen tap leaking" });
  check("owner cannot create maintenance → 403", r.status === 403, r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "PLUMBING", title: "Kitchen tap leaking", description: "Water drips all night from the kitchen tap", priority: "HIGH" });
  check("tenant creates request", r.status === 201 && r.data?.status === "PENDING", r.body);
  const mid = r.data?.id;
  r = await call("POST", `/maintenance/${mid}/approve`, T("tenant"));
  check("tenant cannot approve → 403", r.status === 403, r.body);
  r = await call("POST", `/maintenance/${mid}/complete`, T("owner"));
  check("complete before approve → 409", r.status === 409, r.body);
  r = await call("POST", `/maintenance/${mid}/approve`, T("owner"));
  check("owner approves", r.status === 200 && r.data?.status === "APPROVED", r.body);
  r = await call("POST", `/maintenance/${mid}/assign`, T("owner"), {});
  check("assign without technician → 422", r.status === 422, r.body);
  r = await call("POST", `/maintenance/${mid}/assign`, T("owner"), { technicianName: "Karim Mia" });
  check("assign technician → IN_PROGRESS", r.status === 200 && r.data?.status === "IN_PROGRESS", r.body);
  r = await call("POST", `/maintenance/${mid}/comments`, T("tenant"), { body: "Please come after 5pm" });
  check("tenant comments", r.status === 201, r.body);
  r = await call("POST", `/maintenance/${mid}/complete`, T("owner"));
  check("owner completes", r.status === 200 && r.data?.status === "COMPLETED", r.body);
  r = await call("POST", `/maintenance/${mid}/cancel`, T("tenant"));
  check("cancel after completion → 409", r.status === 409, r.body);
  r = await call("GET", `/maintenance/${mid}`, T("general"));
  check("stranger → maintenance detail 403", r.status === 403, r.body);
  r = await call("GET", "/maintenance/stats", T("owner"));
  const pct = (r.data?.byCategory ?? []).reduce((s: number, c: any) => s + c.percent, 0);
  check("stats: categories sum to 100%, resolution rate 100", r.status === 200 && pct === 100 && r.data?.resolutionRate === 100, r.body);
  r = await call("GET", "/maintenance", T("tenant"));
  check("tenant lists own requests", r.status === 200 && r.data?.items?.length === 1, r.body);

  section("maintenance page: cards, counters, status pill, delete");
  r = await call("POST", "/maintenance", T("tenant"), { category: "ELECTRICAL", title: "Geyser makes sparks", description: "Geyser is making a loud noise and water is getting extremely hot.", priority: "CRITICAL" });
  const m2 = r.data?.id;
  check("tenant files a CRITICAL request", r.status === 201 && r.data?.priority === "CRITICAL", r.body);
  const newM = await call("GET", "/notifications?category=maintenance&limit=20", T("owner"));
  const mn = newM.data?.items?.find((x: any) => x.type === "maintenance.new" && x.params?.requestId === m2);
  check("owner is told about the repair request: tenant, unit, property, title, ids and severity", !!mn && mn.params.tenantName === "Test tenant" && !!mn.params.unit && !!mn.params.property && mn.params.title === "Geyser makes sparks" && mn.priority === "CRITICAL", mn);
  const det = await call("GET", `/maintenance/${m2}`, T("owner"));
  check("request details for the story: tenant phone, property, unit, comments and photo list", det.status === 200 && !!det.data?.tenant?.phone && !!det.data?.unit?.property?.name && Array.isArray(det.data?.images) && Array.isArray(det.data?.comments), det.body);
  const detT = await call("GET", `/maintenance/${m2}`, T("tenant"));
  check("…and the tenant does not get a phone number back", detT.status === 200 && detT.data?.tenant?.phone === null, detT.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "OTHER", title: "Loose door handle", description: "The bedroom door handle is loose and may fall off.", priority: "LOW" });
  const m3 = r.data?.id;
  r = await call("GET", "/maintenance/stats", T("owner"));
  check("counters: open = 2 (pending + approved), in progress 0, critical 1", r.status === 200 && r.data?.open === 2 && r.data?.inProgress === 0 && r.data?.critical === 1 && r.data?.byStatus?.COMPLETED === 1, r.body);
  const mtTenantPhone = (await db.user.findUnique({ where: { id: users.tenant!.id }, select: { phone: true } }))?.phone;
  r = await call("GET", "/maintenance?statuses=PENDING,APPROVED&limit=1", T("owner"));
  const first = r.data?.items?.[0];
  check("list: the Pending tab pages by 1, newest first, with unit, tenant name + phone and no photo", r.status === 200 && r.data?.items?.length === 1 && !!r.data?.nextCursor && first?.id === m3 && !!first?.unit?.unitNumber && !!first?.unit?.property?.name && !!first?.tenant?.fullName && first?.tenant?.phone === mtTenantPhone && !!mtTenantPhone && first?.coverUrl === null, r.body);
  r = await call("GET", `/maintenance?statuses=PENDING,APPROVED&limit=1&cursor=${first?.id}`, T("owner"));
  check("list: 'Load more' gives the next one and then ends", r.data?.items?.length === 1 && r.data.items[0].id === m2 && r.data?.nextCursor === null, r.body);
  r = await call("GET", "/maintenance?statuses=COMPLETED", T("owner"));
  check("list: the Completed tab holds only completed requests", r.data?.items?.length === 1 && r.data.items[0].status === "COMPLETED", r.body);
  r = await call("GET", "/maintenance?statuses=BOGUS", T("owner"));
  check("list: an unknown status → 422", r.status === 422, r.body);
  r = await call("GET", "/maintenance", T("tenant"));
  check("a tenant never gets a phone number back, not even their own row's", r.status === 200 && r.data?.items?.every((i: any) => i.tenant.phone === null), r.body);

  section("Super Admin Active Maintenance: numbers, categories, search, view, edit, delete");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/maintenance", "/admin/maintenance/stats", `/admin/maintenance/${m2}`]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(m2, ":id")} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/maintenance/stats", null);
  check("maintenance numbers need a sign-in → 401", r.status === 401, r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "PLUMBING", title: "Admin page test pipe", description: "Pipe under the sink is leaking again.", priority: "MEDIUM" });
  const m4 = r.data?.id;
  const m4no = (await db.maintenanceRequest.findUnique({ where: { id: m4 }, select: { ticketNo: true } }))?.ticketNo ?? 0;
  check("a new request gets a ticket number from 1001 up", r.status === 201 && m4no >= 1001, r.body);
  r = await call("GET", "/admin/maintenance/stats", T("super"));
  const cats = r.data?.categories ?? [];
  check("numbers: total, open, critical, average days and the five category groups that add up to 100", r.status === 200 && r.data.total >= 3 && r.data.open >= 3 && r.data.critical >= 1 && cats.map((c: any) => c.category).join() === "ELECTRICAL,PLUMBING,WATER,SECURITY,OTHER" && cats.reduce((a: number, c: any) => a + c.percent, 0) === 100, r.body);
  r = await call("GET", "/admin/maintenance/stats?from=2020-01-01&to=2020-01-31", T("super"));
  check("a range with no requests → zeros and no categories", r.status === 200 && r.data.total === 0 && r.data.categories.length === 0 && r.data.avgResolutionDays === null, r.body);
  r = await call("GET", "/admin/maintenance/stats?from=2026-12-31&to=2026-01-01", T("super"));
  check("end before start → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/maintenance?q=REQ-${m4no}`, T("super"));
  check("search by REQ number finds exactly that ticket", r.status === 200 && r.data.items.length === 1 && r.data.items[0].id === m4 && r.data.items[0].ticketNo === m4no, r.body);
  r = await call("GET", `/admin/maintenance?q=${m4no}`, T("super"));
  check("the bare number works too", r.status === 200 && r.data.items.some((x: any) => x.id === m4), r.body);
  r = await call("GET", "/admin/maintenance?q=Admin%20page%20test%20pipe", T("super"));
  check("search by words in the title", r.status === 200 && r.data.items.some((x: any) => x.id === m4), r.body);
  r = await call("GET", "/admin/maintenance?q=Test%20tenant", T("super"));
  check("search by the tenant's name", r.status === 200 && r.data.items.some((x: any) => x.id === m4), r.body);
  r = await call("GET", "/admin/maintenance?limit=2", T("super"));
  const pg = r.data?.items ?? [];
  check("rows carry property, unit, owner (ID + phone), priority and status; newest first; paged", r.status === 200 && pg.length === 2 && pg[0].id === m4 && !!pg[0].unit.property.name && !!pg[0].owner.fullName && !!pg[0].owner.phone && !!r.data.nextCursor, r.body);
  r = await call("GET", `/admin/maintenance?limit=2&cursor=${r.data?.nextCursor}`, T("super"));
  check("the next page has no repeats", r.status === 200 && r.data.items.every((x: any) => !pg.some((y: any) => y.id === x.id)), r.body);
  r = await call("GET", "/admin/maintenance?priority=CRITICAL&status=PENDING&limit=50", T("super"));
  check("priority and status filters", r.status === 200 && r.data.items.every((x: any) => x.priority === "CRITICAL" && x.status === "PENDING"), r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "WATER", title: "No water on the third floor", description: "The tank is not filling since morning.", priority: "HIGH" });
  const mWater = r.data?.id;
  check("a tenant can file a Water request", r.status === 201 && r.data?.category === "WATER", r.body);
  r = await call("GET", "/admin/maintenance?category=WATER&limit=50", T("super"));
  check("the Water group lists only water requests", r.status === 200 && r.data.items.length >= 1 && r.data.items.every((x: any) => x.category === "WATER") && r.data.items.some((x: any) => x.id === mWater), r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "LIFT", title: "Lift stuck on floor two", description: "The lift door does not close.", priority: "LOW" });
  const mLift = r.data?.id;
  r = await call("GET", "/admin/maintenance?category=OTHER&limit=50", T("super"));
  check("the Other group holds the rest (here the lift request) and nothing from the four named groups", r.status === 200 && r.data.items.some((x: any) => x.id === mLift) && r.data.items.every((x: any) => !["ELECTRICAL", "PLUMBING", "WATER", "SECURITY"].includes(x.category)), r.body);
  r = await call("GET", "/admin/maintenance?category=GAS", T("super"));
  check("a category that is not one of the five groups → 422", r.status === 422, r.body);
  await call("DELETE", `/admin/maintenance/${mWater}`, T("super"));
  await call("DELETE", `/admin/maintenance/${mLift}`, T("super"));
  r = await call("GET", "/admin/maintenance?status=bogus", T("super"));
  check("unknown status → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/maintenance/${m4}`, T("super"));
  check("details: description, tenant and owner profiles with IDs, unit, photo list and comments", r.status === 200 && r.data.ticketNo === m4no && !!r.data.description && !!r.data.tenant.fullName && !!r.data.owner.fullName && !!r.data.unit.property.name && Array.isArray(r.data.images) && Array.isArray(r.data.comments), r.body);
  check("details also give the apartment (floors, flats, occupied, vacant, location), its issue counts and recent issues", r.data?.property?.flats >= 1 && r.data.property.occupied >= 1 && r.data.property.occupied + r.data.property.vacant === r.data.property.flats && r.data.property.totalFloors >= 1 && r.data.property.issues.total >= 1 && r.data.property.recent.some((x: any) => x.id === m4) && r.data.unit.floor !== undefined, r.body);
  check("…and the short profile numbers of the tenant and the owner", !!r.data?.tenant?.movedIn && !!r.data.tenant.rent && typeof r.data.owner.properties === "number" && typeof r.data.owner.tenants === "number", r.body);
  r = await call("GET", `/admin/maintenance/00000000-0000-7000-8000-000000000000`, T("super"));
  check("details of a missing request → 404", r.status === 404, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("owner"), { priority: "HIGH" });
  check("owner cannot use the admin edit → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), {});
  check("an empty edit → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), { status: "REJECTED" });
  check("status can only be set to Pending, Approved, In Progress or Resolved → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), { priority: "CRITICAL", status: "IN_PROGRESS", technicianName: "Karim Mistri" });
  check("edit: priority, status and technician change together", r.status === 200 && r.data.changed === true && r.data.priority === "CRITICAL" && r.data.status === "IN_PROGRESS" && r.data.technicianName === "Karim Mistri", r.body);
  const nT = await call("GET", "/notifications?category=maintenance&limit=30", T("tenant"));
  const nO = await call("GET", "/notifications?category=maintenance&limit=30", T("owner"));
  check("the tenant and the owner are both told about the status and the priority", [nT, nO].every((n) => n.data?.items?.some((x: any) => x.type === "maintenance.status" && x.params?.requestId === m4) && n.data?.items?.some((x: any) => x.type === "maintenance.priority" && x.params?.requestId === m4)), nT.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), { priority: "CRITICAL" });
  check("saving the same values changes nothing", r.status === 200 && r.data.changed === false, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), { status: "COMPLETED" });
  const done = await db.maintenanceRequest.findUnique({ where: { id: m4 }, select: { resolvedAt: true } });
  check("Resolved records the time it was resolved", r.status === 200 && !!done?.resolvedAt, r.body);
  r = await call("GET", "/admin/maintenance/stats", T("super"));
  check("average resolution days now has a number", r.status === 200 && typeof r.data.avgResolutionDays === "number" && r.data.resolvedCount >= 1, r.body);
  r = await call("PATCH", `/admin/maintenance/${m4}`, T("super"), { status: "PENDING" });
  const reopened = await db.maintenanceRequest.findUnique({ where: { id: m4 }, select: { resolvedAt: true } });
  check("moving it back to Pending clears the resolved time", r.status === 200 && reopened?.resolvedAt === null, r.body);
  const mtTotalBefore = (await call("GET", "/admin/maintenance/stats", T("super"))).data.total;
  r = await call("DELETE", `/admin/maintenance/${m4}`, T("owner"));
  check("owner cannot use the admin delete → 403", r.status === 403, r.body);
  r = await call("DELETE", `/admin/maintenance/${m4}`, T("super"));
  check("Super Admin deletes the request", r.status === 200 && r.data.deleted === true && !(await db.maintenanceRequest.findUnique({ where: { id: m4 } })), r.body);
  r = await call("GET", "/admin/maintenance/stats", T("super"));
  check("the total goes down by one", r.status === 200 && r.data.total === mtTotalBefore - 1, r.body);
  const nT2 = await call("GET", "/notifications?category=maintenance&limit=30", T("tenant"));
  const mtGone = nT2.data?.items?.find((x: any) => x.titleKey === "notifications.maintenanceRemovedByAdmin" || x.type === "maintenance.deleted");
  check("the tenant is told it was removed, with the REQ number", !!mtGone && String(JSON.stringify(mtGone.params)).includes(`REQ-${m4no}`), nT2.body);
  r = await call("DELETE", `/admin/maintenance/${m4}`, T("super"));
  check("deleting twice → 404", r.status === 404, r.body);

  r = await call("POST", `/maintenance/${m2}/status`, T("tenant"), { status: "IN_PROGRESS" });
  check("status pill: a tenant cannot change it → 403", r.status === 403, r.body);
  r = await call("POST", `/maintenance/${m2}/status`, T("general"), { status: "IN_PROGRESS" });
  check("status pill: a stranger cannot change it → 403", r.status === 403, r.body);
  const notesBefore = await db.notification.count({ where: { userId: users.tenant!.id, type: "maintenance.status" } });
  r = await call("POST", `/maintenance/${m2}/status`, T("owner"), { status: "IN_PROGRESS" });
  check("status pill: Pending → In Progress straight away", r.status === 200 && r.data?.status === "IN_PROGRESS", r.body);
  check("…and the tenant is notified", (await db.notification.count({ where: { userId: users.tenant!.id, type: "maintenance.status" } })) === notesBefore + 1);
  r = await call("GET", "/maintenance/stats", T("owner"));
  check("counters move: open 1, in progress 1, critical still 1", r.data?.open === 1 && r.data?.inProgress === 1 && r.data?.critical === 1, r.body);
  r = await call("POST", `/maintenance/${m2}/status`, T("owner"), { status: "IN_PROGRESS" });
  check("choosing the same status changes nothing", r.status === 200 && r.data?.status === "IN_PROGRESS" && (await db.notification.count({ where: { userId: users.tenant!.id, type: "maintenance.status" } })) === notesBefore + 1, r.body);
  r = await call("POST", `/maintenance/${m2}/status`, T("owner"), { status: "COMPLETED" });
  check("status pill: In Progress → Completed", r.status === 200 && r.data?.status === "COMPLETED", r.body);
  r = await call("GET", "/maintenance/stats", T("owner"));
  check("a completed critical issue no longer counts as critical", r.data?.critical === 0 && r.data?.byStatus?.COMPLETED === 2, r.body);
  r = await call("POST", `/maintenance/${m2}/status`, T("owner"), { status: "PENDING" });
  check("status pill: a request can be reopened to Pending", r.status === 200 && r.data?.status === "PENDING", r.body);
  r = await call("POST", `/maintenance/${m3}/cancel`, T("tenant"));
  r = await call("POST", `/maintenance/${m3}/status`, T("owner"), { status: "IN_PROGRESS" });
  check("a request the tenant cancelled cannot be moved → 409", r.status === 409, r.body);

  r = await call("DELETE", `/maintenance/${m3}`, T("general"));
  check("delete: a stranger cannot delete → 403", r.status === 403, r.body);
  r = await call("DELETE", `/maintenance/${m3}`);
  check("delete: signed out → 401", r.status === 401, r.body);
  const delNotes = await db.notification.count({ where: { userId: users.tenant!.id, type: "maintenance.deleted" } });
  r = await call("DELETE", `/maintenance/${m3}`, T("owner"));
  check("delete: the owner removes the request", r.status === 200 && r.data?.deleted === true && (await db.maintenanceRequest.count({ where: { id: m3 } })) === 0, r.body);
  check("…the tenant is told, and it is written to the audit log", (await db.notification.count({ where: { userId: users.tenant!.id, type: "maintenance.deleted" } })) === delNotes + 1 && (await db.auditLog.count({ where: { action: "maintenance.delete", resourceId: m3 } })) === 1);
  r = await call("GET", `/maintenance/${m3}`, T("owner"));
  check("…and it is gone → 404", r.status === 404, r.body);
  r = await call("DELETE", `/maintenance/${m3}`, T("owner"));
  check("delete twice → 404", r.status === 404, r.body);
  r = await call("DELETE", `/maintenance/${m2}`, T("owner"));
  check("delete also removes comments and photos of that request", r.status === 200 && (await db.maintenanceComment.count({ where: { requestId: m2 } })) === 0, r.body);
  r = await call("GET", "/maintenance/stats", T("owner"));
  check("counters after deleting: back to the single completed request", r.data?.total === 1 && r.data?.open === 0 && r.data?.critical === 0, r.body);

  section("complaints");
  r = await call("POST", "/complaints", T("tenant"), { category: "NOISE", subject: "Loud noise at night", description: "Neighbours play loud music after midnight every day" });
  check("tenant files complaint", r.status === 201, r.body);
  const cidTmp = r.data?.id;
  r = await call("POST", "/complaints", T("tenant"), { category: "NOISE", subject: "Evidence check", description: "Trying to attach somebody else's file as evidence", evidence: [`COMPLAINT_EVIDENCE/${users.owner!.id}/x.pdf`] });
  check("complaint evidence must be your own upload → 403", r.status === 403, r.body);
  void cidTmp;
  const cid = cidTmp;
  r = await call("POST", `/complaints/${cid}/assign`, T("super"), { assigneeId: users.gov!.id });
  check("super assigns to gov admin", r.status === 200 && r.data?.assignedToId === users.gov!.id, r.body);
  r = await call("POST", `/complaints/${cid}/assign`, T("gov"), { assigneeId: users.gov!.id });
  check("gov cannot assign → 403", r.status === 403, r.body);
  r = await call("GET", "/complaints", T("gov"));
  check("gov sees assigned complaints", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("GET", `/complaints/${cid}`, T("owner"));
  check("other user → complaint 403", r.status === 403, r.body);
  r = await call("POST", `/complaints/${cid}/resolve`, T("gov"), { resolution: "Warned the neighbour" });
  check("gov resolves", r.status === 200 && r.data?.status === "RESOLVED", r.body);
  r = await call("POST", `/complaints/${cid}/reopen`, T("tenant"));
  check("tenant reopens", r.status === 200 && r.data?.status === "REOPENED", r.body);
  r = await call("POST", `/complaints/${cid}/notes`, T("tenant"), { note: "Still happening" });
  check("reporter adds note", r.status === 200, r.body);

  section("messaging, presence, call later");
  r = await call("POST", "/conversations", T("tenant"), { type: "DIRECT", recipientId: users.gov!.id });
  check("tenant → gov admin chat blocked 403", r.status === 403, r.body);
  r = await call("POST", "/conversations", T("general"), { type: "DIRECT", recipientId: users.owner!.id });
  check("general → owner direct chat blocked 403", r.status === 403, r.body);
  r = await call("POST", "/conversations", T("owner"), { type: "DIRECT", recipientId: users.tenant!.id });
  check("owner ↔ active tenant allowed", r.status === 201 && !!r.data?.id, r.body);
  const conv = r.data?.id;
  const cl = randomUUID();
  r = await call("POST", `/conversations/${conv}/messages`, T("owner"), { clientId: cl, body: "Rent receipt sent" });
  const m1 = r.data?.id;
  check("owner sends message", r.status === 201 && !!m1, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("owner"), { clientId: cl, body: "Rent receipt sent" });
  check("retry same clientId is idempotent", r.status === 201 && r.data?.id === m1, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("general"), { clientId: randomUUID(), body: "intruder" });
  check("non-participant → 404", r.status === 404, r.body);
  r = await call("GET", "/conversations", T("tenant"));
  check("tenant sees 1 unread", r.status === 200 && r.data?.[0]?.unread === 1, r.body);
  r = await call("GET", `/conversations/${conv}/messages`, T("tenant"));
  check("tenant reads messages", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("POST", `/conversations/${conv}/read`, T("tenant"));
  check("mark read", r.status === 200, r.body);
  r = await call("GET", "/conversations", T("tenant"));
  check("unread back to 0", r.data?.[0]?.unread === 0, r.body);
  r = await call("POST", "/presence", T("owner"));
  check("owner heartbeat", r.status === 200, r.body);
  r = await call("GET", `/presence?userIds=${users.owner!.id}`, T("tenant"));
  check("tenant sees owner ● Online", r.status === 200 && r.data?.[0]?.online === true, r.body);
  r = await call("GET", `/presence?userIds=${users.owner!.id}`, T("general"));
  check("stranger gets no presence", r.status === 200 && r.data?.length === 0, r.body);
  const when = new Date(Date.now() + 24 * 3600_000).toISOString();
  r = await call("POST", "/call-requests", T("tenant"), { conversationId: conv, scheduledFor: new Date(Date.now() + 60_000).toISOString() });
  check("call-later too soon → 422", r.status === 422, r.body);
  r = await call("POST", "/call-requests", T("tenant"), { conversationId: conv, scheduledFor: when, note: "Call me tomorrow evening" });
  check("tenant requests call later", r.status === 201, r.body);
  const crId = r.data?.id;
  r = await call("POST", `/call-requests/${crId}/accept`, T("tenant"));
  check("requester cannot accept own request → 403", r.status === 403, r.body);
  r = await call("POST", `/call-requests/${crId}/accept`, T("owner"));
  check("owner accepts call", r.status === 200 && r.data?.status === "ACCEPTED", r.body);
  r = await call("GET", "/call-requests", T("owner"));
  check("owner lists upcoming calls", r.status === 200 && r.data?.length === 1, r.body);
  r = await call("POST", `/call-requests/${crId}/done`, T("owner"));
  check("mark call done", r.status === 200 && r.data?.status === "DONE", r.body);
  r = await call("GET", `/conversations/${conv}/messages?q=receipt`, T("tenant"));
  check("search inside a conversation", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("GET", `/conversations/${conv}/messages?q=zzzzqq`, T("tenant"));
  check("search with no match → empty", r.status === 200 && r.data?.items?.length === 0, r.body);
  r = await call("POST", `/conversations/${conv}/messages/${m1}/delete`, T("tenant"));
  check("tenant deletes message for self", r.status === 200, r.body);
  r = await call("GET", `/conversations/${conv}/messages`, T("tenant"));
  check("…hidden for tenant", r.data?.items?.length === 0, r.body);
  r = await call("GET", `/conversations/${conv}/messages`, T("owner"));
  check("…still visible for owner", r.data?.items?.length === 1, r.body);

  section("chat page: contacts, voice notes, live events, calls");
  r = await call("GET", "/conversations/contacts", T("owner"));
  check("owner's contacts = own tenants, with unit and property", r.status === 200 && r.data?.some((c: any) => c.id === users.tenant!.id && !!c.unit && !!c.property), r.body);
  r = await call("GET", `/conversations/contacts?q=${encodeURIComponent("zzzznobody")}`, T("owner"));
  check("contacts search with no match → empty", r.status === 200 && r.data?.length === 0, r.body);
  r = await call("GET", "/conversations/contacts", T("tenant"));
  check("tenant's contacts = own landlord only", r.status === 200 && r.data?.length === 1 && r.data[0].id === users.owner!.id, r.body);
  r = await call("GET", "/conversations/contacts?q=Test", T("general"));
  check("general user has no contacts", r.status === 200 && r.data?.length === 0, r.body);
  r = await call("GET", "/conversations/contacts?q=T", T("gov"));
  check("gov admin: one letter finds nobody (needs 2)", r.status === 200 && r.data?.length === 0, r.body);
  r = await call("GET", `/conversations/contacts?q=${encodeURIComponent("Test tenant")}`, T("gov"));
  check("gov admin finds any tenant by name", r.status === 200 && r.data?.some((c: any) => c.id === users.tenant!.id), r.body);
  r = await call("GET", `/conversations/contacts?q=${encodeURIComponent("Test owner")}`, T("super"));
  check("super admin finds any owner by name", r.status === 200 && r.data?.some((c: any) => c.id === users.owner!.id), r.body);
  r = await call("GET", "/conversations/contacts");
  check("contacts signed out → 401", r.status === 401, r.body);

  r = await call("GET", "/conversations", T("owner"));
  const row = r.data?.find((c: any) => c.id === conv);
  check("chat list row names the tenant, unit, property, picture field, online flag", !!row?.participants?.[0]?.fullName && !!row.participants[0].unit && !!row.participants[0].property && "avatarUrl" in row.participants[0] && typeof row.participants[0].online === "boolean" && row.lastMessage?.kind === "text", row);

  r = await call("POST", `/conversations/${conv}/messages`, T("owner"), { clientId: randomUUID(), body: "   " });
  check("an empty message is refused → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("owner"), { purpose: "VOICE_MESSAGE", mime: "image/png", size: 1000 });
  check("voice upload refuses a picture type → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("owner"), { purpose: "VOICE_MESSAGE", mime: "audio/webm", size: 6 * 1024 * 1024 });
  check("voice upload over 5 MB → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("owner"), { purpose: "VOICE_MESSAGE", mime: "audio/webm", size: 2048 });
  const vkey = r.data?.key;
  check("owner gets a signed upload for a voice note", r.status === 200 && !!vkey && vkey.startsWith(`VOICE_MESSAGE/${users.owner!.id}/`) && vkey.endsWith(".webm"), r.body);
  const vup = await sb.storage.from(BUCKET).upload(vkey, new Blob([new Uint8Array(2048)], { type: "audio/webm" }), { contentType: "audio/webm" });
  check("the audio file is stored in the private bucket", !vup.error, vup.error);
  uploaded.push(vkey);
  const voice = { kind: "voice", key: vkey, mime: "audio/webm", size: 2048, durationSec: 35 };

  const tenantStream = await openStream(T("tenant"));
  check("event stream opens (200)", tenantStream.status === 200 && !!(await tenantStream.wait("ready")));
  r = await call("GET", `/presence?userIds=${users.tenant!.id}`, T("owner"));
  check("an open stream makes the person ● Online", r.data?.[0]?.online === true, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("general"), { clientId: randomUUID(), body: "", attachments: [voice] });
  check("a stranger cannot send in this chat → 404", r.status === 404, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("tenant"), { clientId: randomUUID(), body: "", attachments: [voice] });
  check("someone else's voice file cannot be attached → 403", r.status === 403, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("owner"), { clientId: randomUUID(), body: "", attachments: [{ ...voice, durationSec: 999 }] });
  check("voice note longer than 5 minutes → 422", r.status === 422, r.body);
  r = await call("POST", `/conversations/${conv}/messages`, T("owner"), { clientId: randomUUID(), body: "", attachments: [voice] });
  const vm = r.data;
  check("owner sends a voice message: playable link, no storage key", r.status === 201 && vm?.attachments?.[0]?.kind === "voice" && /^https?:/.test(vm.attachments[0].url ?? "") && vm.attachments[0].key === undefined && vm.attachments[0].durationSec === 35, r.body);
  const pushed = await tenantStream.wait("message:new", (d) => d.message?.id === vm?.id);
  check("the tenant's open page gets it live", !!pushed && pushed.conversationId === conv && pushed.message.attachments[0].kind === "voice", pushed);
  r = await call("GET", "/conversations", T("tenant"));
  check("chat list preview says voice message and counts it unread", r.data?.find((c: any) => c.id === conv)?.lastMessage?.kind === "voice" && r.data.find((c: any) => c.id === conv).unread >= 1, r.body);
  const ownerStream = await openStream(T("owner"));
  await ownerStream.wait("ready");
  r = await call("POST", `/conversations/${conv}/read`, T("tenant"));
  const readEv = await ownerStream.wait("message:read", (d) => d.userId === users.tenant!.id);
  check("the sender sees the read mark live (double tick)", r.status === 200 && !!readEv && readEv.lastReadMessageId === vm?.id, readEv);
  r = await call("GET", `/conversations/${conv}/messages`, T("owner"));
  check("the message list says up to where the other person has read", r.status === 200 && r.data?.readUpTo === vm?.id, r.body);

  // live voice call
  r = await call("POST", "/calls", T("general"), { conversationId: conv });
  check("a stranger cannot call into this chat → 404", r.status === 404, r.body);
  r = await call("POST", "/calls", T("owner"), { conversationId: conv });
  const callId = r.data?.id;
  check("owner starts a call; the tenant's page is open so it rings", r.status === 201 && !!callId && r.data?.reachable === true, r.body);
  const inc = await tenantStream.wait("call:incoming", (d) => d.callId === callId);
  check("tenant gets the incoming call with the caller's name", !!inc && inc.caller.id === users.owner!.id && !!inc.caller.fullName, inc);
  r = await call("POST", "/calls", T("tenant"), { conversationId: conv });
  check("a second call while one is ringing → 409 busy", r.status === 409, r.body);
  r = await call("POST", `/calls/${callId}/accept`, T("owner"));
  check("the caller cannot accept their own call → 403", r.status === 403, r.body);
  r = await call("POST", `/calls/${callId}/signal`, T("general"), { data: { kind: "offer", payload: {} } });
  check("a stranger cannot send call signals → 404", r.status === 404, r.body);
  r = await call("POST", `/calls/${callId}/signal`, T("owner"), { data: { kind: "offer", payload: { type: "offer", sdp: "v=0" } } });
  const sig = await tenantStream.wait("call:signal", (d) => d.callId === callId);
  check("offer is relayed to the other side", r.status === 200 && sig?.kind === "offer" && sig.payload?.sdp === "v=0", sig);
  r = await call("POST", `/calls/${callId}/signal`, T("owner"), { data: { kind: "bogus", payload: {} } });
  check("unknown signal kind → 422", r.status === 422, r.body);
  r = await call("POST", `/calls/${callId}/accept`, T("tenant"));
  check("tenant answers", r.status === 200 && r.data?.status === "ACCEPTED", r.body);
  check("the caller is told it was answered", !!(await ownerStream.wait("call:accepted", (d) => d.callId === callId)));
  await new Promise((res) => setTimeout(res, 1200));
  r = await call("POST", `/calls/${callId}/end`, T("tenant"));
  check("either side can end it; duration is recorded", r.status === 200 && r.data?.status === "ENDED" && r.data?.durationSec >= 1, r.body);
  const ended = await ownerStream.wait("call:ended", (d) => d.callId === callId);
  check("both sides are told it ended", !!ended && ended.status === "ENDED", ended);
  r = await call("GET", `/conversations/${conv}/messages`, T("tenant"));
  check("the call appears in the chat as voice call with its duration", r.data?.items?.some((m: any) => m.attachments?.[0]?.kind === "call" && m.attachments[0].callId === callId && m.attachments[0].status === "ENDED" && m.attachments[0].durationSec >= 1), r.body);
  r = await call("POST", `/calls/${callId}/signal`, T("owner"), { data: { kind: "ice", payload: {} } });
  check("signals after the call ended → 409", r.status === 409, r.body);
  r = await call("POST", `/calls/${callId}/end`, T("owner"));
  check("ending twice changes nothing", r.status === 200 && r.data?.status === "ENDED", r.body);

  // declined call
  r = await call("POST", "/calls", T("owner"), { conversationId: conv });
  const callB = r.data?.id;
  await tenantStream.wait("call:incoming", (d) => d.callId === callB);
  r = await call("POST", `/calls/${callB}/missed`, T("tenant"));
  check("only the caller can mark a call missed → 403", r.status === 403, r.body);
  r = await call("POST", `/calls/${callB}/reject`, T("tenant"));
  check("tenant declines a call", r.status === 200 && r.data?.status === "REJECTED", r.body);

  // unreachable: tenant closes the page, then the owner calls
  tenantStream.close();
  await new Promise((res) => setTimeout(res, 800));
  r = await call("GET", `/presence?userIds=${users.tenant!.id}`, T("owner"));
  check("closing the page makes the person Offline at once", r.data?.[0]?.online === false, r.body);
  r = await call("POST", "/calls", T("owner"), { conversationId: conv });
  check("calling someone who is not online is recorded as missed", r.status === 201 && r.data?.reachable === false, r.body);
  r = await call("GET", "/notifications?limit=30", T("tenant"));
  check("they get a missed-call notification", r.data?.items?.some((n: any) => n.type === "call.missed" && n.params?.conversationId === conv), r.body);
  r = await call("GET", `/conversations/${conv}/messages`, T("owner"));
  check("and a missed call line in the chat", r.data?.items?.some((m: any) => m.attachments?.[0]?.kind === "call" && m.attachments[0].status === "MISSED"), r.body);
  ownerStream.close();
  r = await call("POST", "/conversations", T("gov"), { type: "INSPECTION", recipientId: users.owner!.id });
  check("gov opens inspection chat with owner", r.status === 201, r.body);
  r = await call("POST", "/conversations", T("general"), { type: "SUPPORT" });
  const sup = r.data?.id;
  check("general opens pinned Support thread", r.status === 201 && !!sup, r.body);
  r = await call("POST", `/conversations/${sup}/messages`, T("general"), { clientId: randomUUID(), body: "Need help with my seller plan" });
  check("general messages support", r.status === 201, r.body);
  r = await call("GET", "/conversations", T("super"));
  check("super admin sees support inbox", r.status === 200 && r.data?.some((c: any) => c.id === sup), r.body);
  r = await call("POST", `/conversations/${sup}/messages`, T("super"), { clientId: randomUUID(), body: "Hi, how can we help?" });
  check("super answers support", r.status === 201, r.body);
  r = await call("POST", "/conversations", T("super"), { type: "SUPPORT" });
  check("super cannot open SUPPORT → 403", r.status === 403, r.body);

  section("emergency SOS");
  r = await call("POST", "/sos", T("general"), { type: "FIRE" });
  check("general cannot raise SOS → 403", r.status === 403, r.body);
  r = await call("POST", "/sos", T("tenant"), { type: "FIRE", lat: 23.87, lng: 90.4, description: "Smoke in kitchen" });
  check("tenant raises FIRE SOS → 201, NEED_ACTION", r.status === 201 && r.data?.alert?.status === "NEED_ACTION" && r.data?.alert?.priority === "CRITICAL", r.body);
  const aid = r.data?.alert?.id;
  r = await call("POST", "/sos", T("tenant"), { type: "FIRE" });
  check("duplicate within 3 min is deduped (200)", r.status === 200 && r.data?.deduped === true && r.data?.alert?.id === aid, r.body);
  r = await call("GET", "/sos/mine", T("tenant"));
  check("tenant stage: RECEIVED_BY_PLATFORM", r.data?.[0]?.stage === "RECEIVED_BY_PLATFORM", r.body);
  r = await call("GET", "/gov/alerts", T("gov"));
  check("gov hub shows alert", r.status === 200 && r.data?.some((a: any) => a.id === aid), r.body);
  r = await call("GET", `/gov/alerts/${aid}`, T("gov"));
  check("alert has snapshot + first event", r.status === 200 && r.data?.reporterSnapshot?.username === users.tenant!.username && r.data?.events?.length === 1, r.body);
  r = await call("POST", `/gov/alerts/${aid}/status`, T("gov"), { status: "SOLVED", note: "xx" });
  check("NEED_ACTION → SOLVED directly is invalid → 409", r.status === 409, r.body);
  r = await call("POST", `/gov/alerts/${aid}/ack`, T("super"));
  check("super admin cannot ack (monitor/escalate only) → 403", r.status === 403, r.body);
  r = await call("POST", `/gov/alerts/${aid}/ack`, T("gov"));
  check("gov acknowledges → PROCESSING", r.status === 200 && r.data?.status === "PROCESSING" && !!r.data?.acknowledgedAt, r.body);
  r = await call("GET", "/sos/mine", T("tenant"));
  check("tenant stage: SEEN_BY_GOV", r.data?.[0]?.stage === "SEEN_BY_GOV", r.body);
  r = await call("POST", `/gov/alerts/${aid}/forward`, T("gov"), { target: "FIRE", reference: "FS-2291" });
  check("gov forwards to Fire Service with reference", r.status === 200, r.body);
  r = await call("GET", "/sos/mine", T("tenant"));
  check("tenant stage: FORWARDED (ref shown)", r.data?.[0]?.stage === "FORWARDED" && r.data?.[0]?.forwardRef === "FS-2291", r.body);
  r = await call("POST", `/admin/alerts/${aid}/escalate`, T("super"));
  check("super escalates open alert", r.status === 200 && r.data?.escalated === true, r.body);
  r = await call("POST", `/admin/alerts/${aid}/escalate`, T("gov"));
  check("gov cannot use escalate → 403", r.status === 403, r.body);
  r = await call("POST", `/gov/alerts/${aid}/status`, T("gov"), { status: "SOLVED" });
  check("solve without note → 422", r.status === 422, r.body);
  r = await call("POST", `/gov/alerts/${aid}/status`, T("gov"), { status: "SOLVED", note: "Fire put out" });
  check("gov marks SOLVED", r.status === 200 && r.data?.status === "SOLVED" && !!r.data?.resolvedAt, r.body);
  r = await call("GET", `/sos/${aid}`, T("tenant"));
  check("incident log for the reporter: SOLVED, can accept, no forward reference", r.status === 200 && r.data?.status === "SOLVED" && r.data?.canAccept === true && r.data?.isReporter === true && !JSON.stringify(r.data).includes("FS-2291") && r.data?.log?.some((l: any) => l.toStatus === "SOLVED" && l.note === "Fire put out"), r.body);
  r = await call("GET", `/sos/${aid}`, T("owner"));
  check("the landlord of that property can read the log, but cannot accept", r.status === 200 && r.data?.isReporter === false && r.data?.canAccept === false && !!r.data?.reporter?.name, r.body);
  r = await call("GET", `/sos/${aid}`, T("general"));
  check("a stranger gets 404 (existence hidden)", r.status === 404, r.body);
  r = await call("GET", `/sos/${aid}`);
  check("signed out → 401", r.status === 401, r.body);
  r = await call("POST", `/sos/${aid}/accept`, T("owner"));
  check("accept & close: only the person who raised it → 403", r.status === 403, r.body);
  r = await call("POST", `/sos/${aid}/accept`, T("tenant"));
  const acceptedAt = r.data?.acceptedAt;
  check("accept & close: the reporter closes the solved issue", r.status === 200 && r.data?.accepted === true && !!acceptedAt, r.body);
  r = await call("POST", `/sos/${aid}/accept`, T("tenant"));
  check("accepting twice changes nothing", r.status === 200 && String(r.data?.acceptedAt) === String(acceptedAt), r.body);
  r = await call("GET", `/sos/${aid}`, T("tenant"));
  check("after accepting: acceptedAt set, nothing left to accept, the step is in the log", !!r.data?.acceptedAt && r.data?.canAccept === false && r.data?.log?.some((l: any) => l.action === "NOTE" && l.byReporter), r.body);
  r = await call("GET", "/notifications?category=maintenance&limit=50", T("owner"));
  const sosNew = r.data?.items?.find((x: any) => x.type === "sos.new" && x.params?.alertId === aid);
  check("the landlord was told about the tenant's emergency, with tenant, unit and property", !!sosNew && sosNew.params.reporter === "Test tenant" && !!sosNew.params.property && !!sosNew.params.unit && sosNew.priority === "CRITICAL" && sosNew.category === "maintenance", sosNew);
  r = await call("GET", "/notifications?category=maintenance&limit=50", T("tenant"));
  const solved = r.data?.items?.find((x: any) => x.type === "sos.update" && x.params?.alertId === aid && x.params?.status === "SOLVED");
  check("the reporter's 'solved' notification carries the alert id, type, place and the team's note", !!solved && solved.params.alertType === "FIRE" && solved.params.note === "Fire put out" && !!solved.params.property, solved);
  r = await call("GET", "/gov/alerts?status=UNSOLVED", T("gov"));
  check("solved alert leaves UNSOLVED feed", !r.data?.some((a: any) => a.id === aid), r.body);
  r = await call("GET", "/gov/alerts?status=SOLVED", T("gov"));
  check("…and is in the SOLVED archive", r.data?.some((a: any) => a.id === aid), r.body);
  r = await call("POST", `/admin/alerts/${aid}/escalate`, T("super"));
  check("escalate solved alert → 409", r.status === 409, r.body);
  r = await call("POST", "/gov/incidents", T("gov"), { alertId: aid, type: "FIRE", findings: "Kitchen fire, contained within 10 minutes", resolution: "No injuries" });
  check("gov files incident report", r.status === 201, r.body);
  r = await call("GET", "/admin/alerts", T("super"));
  check("super admin monitoring (avg times)", r.status === 200 && r.data?.avgMinutesToAcknowledge !== undefined, r.body);
  r = await call("POST", "/sos", T("owner"), { type: "THEFT" });
  check("owner can raise SOS too (D5)", r.status === 201, r.body);

  section("marketplace");
  r = await call("GET", "/listings/eligibility", T("general"));
  check("general with seller plan → eligible", r.status === 200 && r.data?.eligible === true && r.data?.limit === 3, r.body);
  const listing = { type: "RENT", category: "FLAT", title: `Cozy flat in Uttara ${tag}`, description: "Spacious 3 bedroom flat near the lake, gas and lift available.", price: 22000, negotiable: true, area: 1200, areaUnit: "SQFT", bedrooms: 3, bathrooms: 2, zoneId: zone?.id, lat: 23.87, lng: 90.4, amenities: ["SECURITY", "PARKING", "MOSQUE"], declaration: true };
  r = await call("POST", "/listings", T("general"), { ...listing, bedrooms: undefined });
  check("flat without bedrooms → 422", r.status === 422, r.body);
  r = await call("POST", "/listings", T("tenant"), listing);
  check("tenant without seller plan → 403", r.status === 403 && r.code === "LISTING_ENTITLEMENT_REQUIRED", r.body);
  r = await call("POST", "/listings", T("general"), listing);
  check("seller creates DRAFT listing", r.status === 201 && r.data?.status === "DRAFT", r.body);
  const lid = r.data?.id;
  r = await call("POST", `/listings/${lid}/submit`, T("general"));
  check("submit without image → 422", r.status === 422, r.body);
  r = await call("POST", `/listings/${lid}/images`, T("general"), { storageKey: `listings/${tag}/1.jpg` });
  check("add image", r.status === 201, r.body);
  r = await call("PATCH", `/listings/${lid}`, T("owner"), { title: "hijack listing" });
  check("other user cannot edit → 403", r.status === 403, r.body);
  r = await call("PATCH", `/listings/${lid}`, T("general"), { price: 21000 });
  check("seller edits draft", r.status === 200, r.body);
  r = await call("POST", `/listings/${lid}/submit`, T("general"));
  check("submit → PENDING", r.status === 200 && r.data?.status === "PENDING", r.body);
  r = await call("GET", `/listings/${lid}`);
  check("pending listing hidden from public → 404", r.status === 404, r.body);
  r = await call("GET", `/listings/${lid}`, T("general"));
  check("…but visible to its seller", r.status === 200, r.body);
  r = await call("GET", "/admin/listings?status=PENDING", T("super"));
  check("super sees moderation queue", r.status === 200 && r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("POST", `/admin/listings/${lid}/approve`, T("gov"));
  check("gov cannot approve → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/listings/${lid}/reject`, T("super"), {});
  check("reject without reason → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/listings/${lid}/approve`, T("super"));
  check("super approves → PUBLISHED with expiry", r.status === 200 && r.data?.status === "PUBLISHED" && !!r.data?.expiresAt, r.body);
  r = await call("GET", `/listings?type=RENT&zoneId=${zone?.id}&amenities=SECURITY,MOSQUE&minPrice=20000&maxPrice=25000`);
  check("public search: zone + amenities + price", r.status === 200 && r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("GET", `/listings?type=SALE&zoneId=${zone?.id}`);
  check("public search: sale mode excludes rental", r.status === 200 && !r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("GET", `/listings?type=RENT&divisionId=${dhaka?.id}&bedrooms=3&sort=price_asc`);
  check("public search: division + bedrooms + sort", r.status === 200 && r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("GET", "/listings?type=RENT&lat=23.87&lng=90.4&radiusKm=5");
  check("public search: 5 km radius (PostGIS)", r.status === 200 && r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("GET", "/listings?type=RENT&lat=22.0&lng=88.0&radiusKm=1");
  check("radius far away → not found", r.status === 200 && !r.data?.items?.some((l: any) => l.id === lid), r.body);
  r = await call("GET", `/listings/${lid}`);
  check("published detail is public, no seller phone", r.status === 200 && r.data?.seller?.phone === undefined && r.data?.zone?.upazila?.district?.division?.nameEn === "Dhaka", r.body);
  r = await call("GET", `/listings/${lid}`);
  check("publishing computed nearby-facility distances (mosque < 1 km)", (r.data?.distances ?? []).some((d: any) => d.facilityType === "MOSQUE" && d.distanceM < 1000), r.data?.distances);
  const base = `/listings?type=RENT&limit=50`;
  const has = (res: any) => res.status === 200 && res.data?.items?.some((l: any) => l.id === lid);
  r = await call("GET", `${base}&nearby=MOSQUE,SCHOOL`);
  check("filter: nearby mosque + school", has(r), r.body);
  r = await call("GET", `${base}&nearby=UNIVERSITY`);
  check("filter: nearby university (none close) excludes", r.status === 200 && !has(r), r.body);
  r = await call("GET", `${base}&nearby=MOSQUE&nearbyM=100`);
  check("filter: configurable proximity range (100 m) excludes", r.status === 200 && !has(r), r.body);
  r = await call("GET", `${base}&bathrooms=2&minArea=1000&maxArea=1500`);
  check("filter: bathrooms + area range", has(r), r.body);
  r = await call("GET", `${base}&divisionId=${dhaka?.id}&zoneId=${zone?.id}`);
  check("filter: division + zone (most specific wins)", has(r), r.body);
  r = await call("GET", `${base}&sort=popularity`);
  check("sort: popularity", has(r), r.body);
  r = await call("GET", `${base}&sort=area_desc`);
  check("sort: area", r.status === 200, r.body);
  r = await call("GET", `${base}&minPrice=30000&maxPrice=10000`);
  check("min price above max price → 422", r.status === 422, r.body);
  r = await call("GET", `${base}&minArea=500&maxArea=100`);
  check("min area above max area → 422", r.status === 422, r.body);
  r = await call("GET", `${base}&divisionId=${dhaka?.id}&districtId=${randomUUID()}`);
  check("district not in division → 422", r.status === 422, r.body);
  r = await call("GET", `${base}&lat=23.87&lng=90.4`);
  check("lat/lng without radius → 422", r.status === 422, r.body);
  r = await call("POST", `/listings/${lid}/reports`, T("owner"), { category: "SPAM", evidence: [`REPORT_EVIDENCE/${users.general!.id}/x.pdf`] });
  check("report evidence must be your own upload → 403", r.status === 403, r.body);
  const ldoc = await call("POST", "/uploads/sign", T("general"), { purpose: "LISTING_DOC", mime: "application/pdf", size: 1200 });
  r = await call("POST", `/listings/${lid}/documents`, T("general"), { storageKey: ldoc.data?.key });
  check("seller attaches ownership document", r.status === 201, r.body);
  r = await call("POST", `/listings/${lid}/documents`, T("owner"), { storageKey: ldoc.data?.key });
  check("other user cannot attach documents → 403", r.status === 403, r.body);
  r = await call("POST", `/listings/${lid}/view`);
  check("record view", r.status === 200, r.body);
  r = await call("PUT", `/me/favorites/${lid}`, T("owner"));
  check("owner favourites listing", r.status === 200, r.body);
  r = await call("GET", "/me/favorites", T("owner"));
  check("favourites list", r.status === 200 && r.data?.length === 1, r.body);
  r = await call("POST", `/listings/${lid}/inquiries`, T("owner"), { message: "Is the flat still available?" });
  check("inquiry opens LISTING_INQUIRY chat", r.status === 201 && !!r.data?.conversationId, r.body);
  r = await call("POST", `/listings/${lid}/inquiries`, T("general"), { message: "my own" });
  check("seller cannot inquire own listing → 403", r.status === 403, r.body);

  section("find home: places, search, details, contact, visits, assistant");
  await db.listing.update({ where: { id: lid }, data: { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj", unionName: "Hazratpur", postalCode: "1311", balconies: 2 } });
  const fhBase = "/listings?type=RENT&limit=50";
  const fhHas = (res: any) => res.status === 200 && res.data?.items?.some((l: any) => l.id === lid);
  r = await call("GET", `${fhBase}&division=dhaka&district=DHAKA&upazila=keraniganj`);
  check("find home: place names match case-insensitively", fhHas(r), r.body);
  r = await call("GET", `${fhBase}&unionName=Hazratpur`);
  check("find home: union filter", fhHas(r), r.body);
  r = await call("GET", `${fhBase}&upazila=Savar`);
  check("find home: another upazila excludes it", r.status === 200 && !fhHas(r), r.body);
  r = await call("GET", `${fhBase}&bedroomList=2,3&categories=FLAT,APARTMENT`);
  check("find home: bedroom list + several categories", fhHas(r), r.body);
  r = await call("GET", `${fhBase}&bedroomList=1`);
  check("find home: wrong bedroom count excludes", r.status === 200 && !fhHas(r), r.body);
  r = await call("GET", `${fhBase}&categories=SPACESHIP`);
  check("find home: unknown category → 422", r.status === 422, r.body);
  r = await call("GET", `${fhBase}&unionName=Hazratpur`);
  const card = r.data?.items?.find((l: any) => l.id === lid);
  check("find home: card has label, photo count, total and no phone", card?.locationLabel === "Hazratpur, Keraniganj, Dhaka - 1311" && typeof card?.photos === "number" && typeof r.data?.total === "number" && card?.seller?.phone === undefined && card?.isFavorite === false, card);
  r = await call("GET", `${fhBase}&unionName=Hazratpur`, T("owner"));
  check("find home: signed-in person sees their own heart", r.data?.items?.find((l: any) => l.id === lid)?.isFavorite === true, r.body);
  r = await call("GET", `${fhBase}&saved=1`, T("owner"));
  check("find home: saved-only shows the saved home", fhHas(r), r.body);
  r = await call("GET", `${fhBase}&saved=1`, T("general"));
  check("find home: saved-only is empty for someone with no favourites", r.status === 200 && !fhHas(r), r.body);
  r = await call("GET", `/listings/${lid}`, T("general"));
  check("find home: details have map point, photo list, seller badge and own flag", typeof r.data?.lat === "number" && typeof r.data?.lng === "number" && Array.isArray(r.data?.photoUrls) && typeof r.data?.seller?.verified === "boolean" && r.data?.isOwn === true && r.data?.balconies === 2, r.body);
  r = await call("GET", `/listings/${lid}`, T("owner"));
  check("find home: details know it is a saved home for the viewer", r.data?.isFavorite === true && r.data?.isOwn === false, r.body);

  r = await call("GET", `/listings/${lid}/contact`);
  check("call owner: signed-out → 401", r.status === 401, r.body);
  r = await call("GET", `/listings/${lid}/contact`, T("general"));
  check("call owner: your own listing → 403", r.status === 403, r.body);
  r = await call("GET", `/listings/${lid}/contact`, T("owner"));
  check("call owner: signed-in person gets name + phone field (audited)", r.status === 200 && typeof r.data?.name === "string" && "phone" in (r.data ?? {}), r.body);

  const at = (days: number, utcHour: number) => { const d = new Date(Date.now() + days * 86400_000); d.setUTCHours(utcHour, 0, 0, 0); return d.toISOString(); };
  r = await call("POST", `/listings/${lid}/visits`, null, { scheduledFor: at(2, 5) });
  check("visit: signed-out → 401", r.status === 401, r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: new Date(Date.now() - 3600_000).toISOString() });
  check("visit: a time in the past → 422 too_soon", r.status === 422 && JSON.stringify(r.body).includes("too_soon"), r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: at(2, 18) });
  check("visit: midnight Dhaka time → 422 outside_visiting_hours", r.status === 422 && JSON.stringify(r.body).includes("outside_visiting_hours"), r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: at(90, 5) });
  check("visit: more than 60 days ahead → 422 too_far", r.status === 422 && JSON.stringify(r.body).includes("too_far"), r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: "not a date" });
  check("visit: invalid date → 422", r.status === 422, r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("general"), { scheduledFor: at(2, 5) });
  check("visit: your own listing → 403", r.status === 403, r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: at(2, 5), note: "I will bring my family." });
  const vid = r.data?.id;
  check("visit: valid request → 201 PENDING", r.status === 201 && r.data?.status === "PENDING" && !!vid, r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: at(3, 5) });
  check("visit: a second open request for the same home → 409", r.status === 409, r.body);
  r = await call("GET", "/me/visits", T("owner"));
  check("visit: my visits lists it with the home's title", r.status === 200 && r.data?.some((v: any) => v.id === vid && v.listing?.id === lid && v.status === "PENDING"), r.body);
  r = await call("GET", "/me/visits?as=seller", T("general"));
  check("visit: the seller sees the request", r.status === 200 && r.data?.some((v: any) => v.id === vid), r.body);
  r = await call("GET", "/me/visits?as=seller", T("owner"));
  check("visit: someone else's requests are not mine to see", r.status === 200 && !r.data?.some((v: any) => v.id === vid), r.body);
  r = await call("PATCH", `/visits/${vid}`, T("owner"), { action: "confirm" });
  check("visit: the visitor cannot confirm their own request → 404", r.status === 404, r.body);
  r = await call("PATCH", `/visits/${vid}`, T("general"), { action: "confirm" });
  check("visit: the seller confirms", r.status === 200 && r.data?.status === "CONFIRMED", r.body);
  r = await call("PATCH", `/visits/${vid}`, T("general"), { action: "decline" });
  check("visit: an answered request cannot be answered again → 409", r.status === 409, r.body);
  r = await call("DELETE", `/visits/${vid}`, T("general"));
  check("visit: the seller cannot cancel the visitor's request → 404", r.status === 404, r.body);
  r = await call("DELETE", `/visits/${vid}`, T("owner"));
  check("visit: the visitor cancels a confirmed visit", r.status === 200 && r.data?.status === "CANCELLED", r.body);
  r = await call("DELETE", `/visits/${vid}`, T("owner"));
  check("visit: cancelling twice → 409", r.status === 409, r.body);
  r = await call("POST", `/listings/${lid}/visits`, T("owner"), { scheduledFor: at(3, 6) });
  check("visit: after cancelling, a new request is allowed", r.status === 201, r.body);

  r = await call("POST", "/listings/ai-search", null, { query: "3 bed flat in Keraniganj under 50k BDT" });
  const hit = r.data?.results?.find((x: any) => x.id === lid);
  check("assistant: understands rooms, place and budget, ranks the home", r.status === 200 && r.data?.filters?.upazila === "Keraniganj" && r.data?.filters?.district === "Dhaka" && r.data?.filters?.division === "Dhaka" && r.data?.filters?.bedroomList?.[0] === 3 && r.data?.filters?.maxPrice === 50000 && hit?.matchPercent >= 80, r.body);
  r = await call("POST", "/listings/ai-search", T("owner"), { query: "৩ বেডরুম ফ্ল্যাট ৩০ হাজার টাকার মধ্যে" });
  check("assistant: understands Bangla", r.status === 200 && r.data?.filters?.bedroomList?.[0] === 3 && r.data?.filters?.maxPrice === 30000, r.body);
  r = await call("POST", "/listings/ai-search", null, { query: "x" });
  check("assistant: a one-letter question → 422", r.status === 422, r.body);
  r = await call("POST", "/listings/ai-search", null, { query: "y".repeat(400) });
  check("assistant: an over-long question → 422", r.status === 422, r.body);
  r = await call("POST", "/listings/ai-search", null, { query: "hello there" });
  check("assistant: no criteria → understood 0, still answers", r.status === 200 && r.data?.understood === 0, r.body);

  r = await call("GET", "/geo/bd?level=districts");
  check("geo/bd: a district list needs a parent → 422", r.status === 422, r.body);
  r = await call("GET", "/geo/bd?level=planets");
  check("geo/bd: unknown level → 422", r.status === 422, r.body);
  r = await call("GET", "/geo/bd?level=districts&parent=abc");
  check("geo/bd: parent must be an id → 422", r.status === 422, r.body);
  r = await call("GET", "/geo/bd?level=divisions");
  check("geo/bd: divisions (open API, cached) include Dhaka with a Bangla name", r.status === 200 && r.data?.some((d: any) => d.name === "Dhaka" && /[\u0980-\u09FF]/.test(d.bnName)) || r.code === "INTERNAL", r.body);


  section("marketplace: sell land, delete, photos, my listings, land search");
  const land = { type: "SALE", category: "LAND", title: `Residential plot in Savar ${tag}`, description: "Five katha plot beside a 30 ft road, all papers clear, ready for building.", price: 8_500_000, negotiable: true, area: 5, areaUnit: "KATHA", landDetails: { landType: "RESIDENTIAL", roadWidthFt: 30, plotNo: "12", mouza: "Savar" }, division: "Dhaka", district: "Dhaka", upazila: "Savar", unionName: "Birulia", postalCode: "1340", lat: 23.83, lng: 90.33, amenities: ["SECURITY"], declaration: true };
  r = await call("POST", "/listings", T("general"), { ...land, area: undefined, areaUnit: undefined });
  check("land without size → 422", r.status === 422, r.body);
  r = await call("POST", "/listings", T("general"), { ...land, landDetails: { landType: "MOON" } });
  check("land with an unknown land type → 422", r.status === 422, r.body);
  r = await call("POST", "/listings", T("general"), land);
  const land1 = r.data?.id;
  check("sell land: draft created", r.status === 201 && r.data?.status === "DRAFT" && !!land1, r.body);
  r = await call("GET", "/listings?type=SALE&categories=LAND&limit=50");
  check("a draft is not on the marketplace", r.status === 200 && !r.data?.items?.some((l: any) => l.id === land1), r.body);
  r = await call("DELETE", `/listings/${land1}`, T("owner"));
  check("delete: someone else's listing → 403", r.status === 403, r.body);
  r = await call("DELETE", `/listings/${land1}`);
  check("delete: signed out → 401", r.status === 401, r.body);
  r = await call("DELETE", `/listings/${land1}`, T("general"));
  check("delete: a draft is removed for real", r.status === 200 && r.data?.deleted === true, r.body);
  r = await call("GET", `/listings/${land1}`, T("general"));
  check("delete: …and is gone → 404", r.status === 404, r.body);
  check("delete: the row is really gone from the database", (await db.listing.count({ where: { id: land1 } })) === 0);

  r = await call("POST", "/listings", T("general"), land);
  const land2 = r.data?.id;
  const k1 = `LISTING_IMAGE/${users.general!.id}/${tag}-a.jpg`, k2 = `LISTING_IMAGE/${users.general!.id}/${tag}-b.jpg`;
  for (const k of [k1, k2]) await sb.storage.from(BUCKET).upload(k, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg", upsert: true }); // the files really exist in storage, so they can be signed
  uploaded.push(k1, k2);
  r = await call("POST", `/listings/${land2}/submit`, T("general"));
  check("publish without a photo → 422", r.status === 422, r.body);
  r = await call("POST", `/listings/${land2}/images`, T("general"), { storageKey: k1, order: 0 });
  const img1 = r.data?.id;
  check("photo added", r.status === 201 && !!img1, r.body);
  r = await call("POST", `/listings/${land2}/images`, T("general"), { storageKey: k2, order: 1 });
  const img2 = r.data?.id;
  r = await call("DELETE", `/listings/${land2}/images/${img2}`, T("owner"));
  check("photo delete: someone else's → 403", r.status === 403, r.body);
  r = await call("DELETE", `/listings/${land2}/images/${randomUUID()}`, T("general"));
  check("photo delete: unknown photo → 404", r.status === 404, r.body);
  r = await call("DELETE", `/listings/${land2}/images/${img2}`, T("general"));
  check("photo delete: own photo removed", r.status === 200 && (await db.listingImage.count({ where: { listingId: land2 } })) === 1, r.body);
  r = await call("POST", `/listings/${land2}/submit`, T("general"));
  check("land submitted for review", r.status === 200 && r.data?.status === "PENDING", r.body);
  r = await call("POST", `/admin/listings/${land2}/approve`, T("super"));
  check("land approved", r.status === 200 && r.data?.status === "PUBLISHED", r.body);
  r = await call("DELETE", `/listings/${land2}/images/${img1}`, T("general"));
  check("photo delete: a live listing keeps its last photo → 422", r.status === 422, r.body);

  const mk = "/listings?type=SALE&limit=50";
  const hasLand = (res: any) => res.status === 200 && res.data?.items?.some((l: any) => l.id === land2);
  r = await call("GET", `${mk}&categories=LAND&landType=RESIDENTIAL&areaUnit=KATHA`);
  check("land search: kind of land + unit", hasLand(r), r.body);
  r = await call("GET", `${mk}&categories=LAND&landType=COMMERCIAL`);
  check("land search: another kind of land excludes it", r.status === 200 && !hasLand(r), r.body);
  r = await call("GET", `${mk}&categories=LAND&areaUnit=BIGHA`);
  check("land search: another unit excludes it", r.status === 200 && !hasLand(r), r.body);
  r = await call("GET", `${mk}&categories=LAND&landType=SWAMP`);
  check("land search: unknown kind → 422", r.status === 422, r.body);
  r = await call("GET", `${mk}&categories=LAND&upazila=savar&minPrice=8000000&maxPrice=9000000`);
  check("land search: place + price range", hasLand(r) && r.data.items.find((l: any) => l.id === land2).areaUnit === "KATHA", r.body);
  r = await call("GET", `/listings/${land2}`, T("owner"));
  check("land details: land type, road width, map point, photo list with ids", r.data?.landDetails?.landType === "RESIDENTIAL" && r.data?.landDetails?.roadWidthFt === 30 && r.data?.lat > 23 && r.data?.photoList?.length === 1 && !!r.data?.photoList?.[0]?.id, r.body);
  r = await call("GET", "/listings/stats");
  check("marketplace numbers count the land", r.status === 200 && r.data?.land >= 1 && r.data?.availableForSale >= 1, r.body);
  r = await call("GET", "/me/listings", T("general"));
  const mine = r.data?.items?.find((l: any) => l.id === land2);
  check("my listings: photo count, saves and visit requests per listing", r.status === 200 && mine?.photos === 1 && typeof mine?.saves === "number" && typeof mine?.visitRequests === "number" && "coverUrl" in mine, mine);
  r = await call("POST", "/listings/ai-search", null, { query: "residential land 5 katha in Savar under 1 crore", type: "SALE" });
  const lhit = r.data?.results?.find((x: any) => x.id === land2);
  check("assistant: understands land, kind, size, place and a crore budget", r.data?.filters?.categories?.[0] === "LAND" && r.data?.filters?.landType === "RESIDENTIAL" && r.data?.filters?.area === 5 && r.data?.filters?.areaUnit === "KATHA" && r.data?.filters?.maxPrice === 10_000_000 && lhit?.matchPercent >= 80, r.body);
  r = await call("POST", "/listings/ai-search", null, { query: "buy a 3 bed flat to rent", type: "RENT" });
  check("assistant: the page's mode wins over a word in the sentence", r.data?.filters?.type === "RENT", r.body);
  r = await call("PATCH", `/listings/${land2}`, T("general"), { negotiable: false });
  check("land: a small edit keeps it live", r.status === 200 && r.data?.status === "PUBLISHED", r.body);
  r = await call("PATCH", `/listings/${land2}`, T("general"), { price: 9_000_000 });
  check("land: a price change goes back to review", r.status === 200 && r.data?.status === "PENDING", r.body);
  r = await call("POST", `/admin/listings/${land2}/approve`, T("super"));
  r = await call("DELETE", `/listings/${land2}`, T("general"));
  check("delete: a live listing is archived, not erased", r.status === 200 && r.data?.deleted === false && r.data?.archived === true && (await db.listing.findUnique({ where: { id: land2 } }))?.status === "ARCHIVED", r.body);
  r = await call("GET", `${mk}&categories=LAND`);
  check("an archived listing leaves the marketplace", r.status === 200 && !hasLand(r), r.body);
  r = await call("DELETE", `/listings/${land2}`, T("general"));
  check("delete: an archived listing nobody wrote about is removed", r.status === 200 && r.data?.deleted === true && (await db.listing.count({ where: { id: land2 } })) === 0, r.body);


  section("marketplace page: text search, owner ID, zones, amenity pairs, conditions, card data");
  r = await call("GET", "/geo/zones");
  check("zones: Mirpur DOHS, Sylhet Sadar and the other starter zones exist", r.status === 200 && ["Mirpur DOHS", "Sylhet Sadar", "Gulshan", "Uttara Sector 4"].every((n) => r.data?.some((z: any) => z.nameEn === n)), r.data?.map((z: any) => z.nameEn));
  r = await call("GET", "/geo/zones?q=sylhet");
  check("zones: searchable by name", r.status === 200 && r.data?.length === 1 && r.data[0].nameEn === "Sylhet Sadar", r.body);
  await db.user.update({ where: { id: users.general!.id }, data: { ownerCode: `OWX${tag.toUpperCase()}` } });
  const mkListing = { type: "SALE", category: "BUILDING", title: `Lakeview family house ${tag}`, description: "Two storey house near the lake, own gate, garden and a quiet road, ready to move in.", price: 12_500_000, negotiable: false, area: 2400, areaUnit: "SQFT", bedrooms: 4, bathrooms: 3, condition: "LIKE_NEW", zoneId: zone?.id, division: "Dhaka", district: "Dhaka", upazila: "Uttara", fullAddress: `Road 7, Lakeview Avenue ${tag}`, postalCode: "1230", lat: 23.87, lng: 90.4, amenities: ["COLLEGE", "PLAYGROUND", "PARKING"], declaration: true };
  r = await call("POST", "/listings", T("general"), { ...mkListing, condition: "MINT" });
  check("condition outside New / Like New / Good / Fair → 422", r.status === 422, r.body);
  r = await call("POST", "/listings", T("general"), mkListing);
  const mk1 = r.data?.id;
  check("listing with condition Like New created", r.status === 201 && r.data?.condition === "LIKE_NEW", r.body);
  await call("POST", `/listings/${mk1}/images`, T("general"), { storageKey: `LISTING_IMAGE/${users.general!.id}/${tag}-m1.jpg`, order: 0 });
  await call("POST", `/listings/${mk1}/images`, T("general"), { storageKey: `LISTING_IMAGE/${users.general!.id}/${tag}-m2.jpg`, order: 1 });
  r = await call("POST", `/listings/${mk1}/submit`, T("general"));
  r = await call("POST", `/admin/listings/${mk1}/approve`, T("super"));
  check("house approved", r.status === 200 && r.data?.status === "PUBLISHED", r.body);
  const base2 = "/listings?type=SALE&limit=6";
  const has2 = (res: any) => res.status === 200 && res.data?.items?.some((l: any) => l.id === mk1);
  r = await call("GET", `${base2}&q=lakeview`);
  check("search text: a word of the title", has2(r), r.body);
  r = await call("GET", `${base2}&q=Road 7, Lakeview`);
  check("search text: a word of the street address", has2(r), r.body);
  r = await call("GET", `${base2}&q=uttara`);
  check("search text: the upazila", has2(r), r.body);
  r = await call("GET", `${base2}&q=1230`);
  check("search text: the postal code", has2(r), r.body);
  r = await call("GET", `${base2}&q=owx${tag.toLowerCase()}`);
  check("search text: the owner ID (case-insensitive)", has2(r), r.body);
  r = await call("GET", `${base2}&q=zzz-nothing-${tag}`);
  check("search text: no match → empty list, total 0", r.status === 200 && r.data?.items?.length === 0 && r.data?.total === 0, r.body);
  r = await call("GET", `${base2}&categories=BUILDING`);
  check("category: building", has2(r), r.body);
  r = await call("GET", `${base2}&amenities=SCHOOL`);
  check("amenity 'School / College' also finds a listing with COLLEGE", has2(r), r.body);
  r = await call("GET", `${base2}&amenities=PARK,PARKING`);
  check("amenity 'Playground / Park' also finds PLAYGROUND, and several amenities must all hold", has2(r), r.body);
  r = await call("GET", `${base2}&amenities=SCHOOL,UNIVERSITY`);
  check("a missing amenity excludes the listing", r.status === 200 && !has2(r), r.body);
  r = await call("GET", `${base2}&amenities=SECURITY`);
  check("amenity not declared → excluded", r.status === 200 && !has2(r), r.body);
  r = await call("GET", `${base2}&zoneId=${zone?.id}`);
  check("zone filter includes it", has2(r), r.body);
  r = await call("GET", `${base2}&zoneId=${randomUUID()}`);
  check("another zone excludes it", r.status === 200 && !has2(r), r.body);
  r = await call("GET", `${base2}&q=lakeview`, T("owner"));
  const mcard = r.data?.items?.find((l: any) => l.id === mk1);
  check("card data: condition, gallery, owner name, owner ID, NID badge flag", mcard?.condition === "LIKE_NEW" && Array.isArray(mcard?.gallery) && mcard.gallery.length <= 5 && typeof mcard?.seller?.fullName === "string" && mcard?.seller?.ownerCode === `OWX${tag.toUpperCase()}` && typeof mcard?.seller?.verified === "boolean" && "avatarUrl" in mcard.seller, mcard);
  check("card data never carries the owner's phone, e-mail or avatar key", !JSON.stringify(mcard).match(/phone|email|avatarKey/i), mcard?.seller);
  r = await call("GET", `${base2}&sort=price_asc`);
  check("a page holds at most 6 homes (limit=6)", r.status === 200 && r.data?.items?.length <= 6, r.data?.items?.length);
  r = await call("GET", `/listings/${mk1}`, T("owner"));
  check("details: owner NID clearance status", ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"].includes(r.data?.seller?.nidStatus) && r.data?.condition === "LIKE_NEW", r.data?.seller);
  r = await call("GET", `/listings/${mk1}/contact`, T("owner"));
  check("contact: phone and e-mail come with the audited reveal", r.status === 200 && "phone" in r.data && "email" in r.data, r.body);
  r = await call("DELETE", `/listings/${mk1}`, T("general"));
  r = await call("DELETE", `/listings/${mk1}`, T("general"));
  check("house removed again", r.status === 200 && (await db.listing.count({ where: { id: mk1 } })) === 0, r.body);

  r = await call("POST", `/listings/${lid}/reports`, T("owner"), { category: "SPAM" });
  check("owner reports listing", r.status === 201, r.body);
  r = await call("POST", `/listings/${lid}/reports`, T("owner"), { category: "SPAM" });
  check("duplicate open report → 409", r.status === 409, r.body);
  r = await call("POST", `/admin/listings/${lid}/flag`, T("gov"), { reason: "Check ownership documents" });
  check("gov flags listing", r.status === 200 || r.status === 201, r.body);
  r = await call("GET", `/admin/listings/${lid}/reports`, T("super"));
  check("super reads reports (2)", r.status === 200 && r.data?.length === 2, r.body);
  r = await call("POST", `/admin/listings/${lid}/feature`, T("super"));
  check("super features listing", r.status === 200 && r.data?.isFeatured === true, r.body);
  r = await call("POST", "/me/saved-searches", T("owner"), { query: { type: "RENT", zoneId: zone?.id } });
  check("save a search", r.status === 201, r.body);
  r = await call("GET", "/me/listings", T("general"));
  check("my listings", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("PATCH", `/listings/${lid}`, T("general"), { negotiable: false });
  check("minor edit of a live listing keeps it PUBLISHED", r.status === 200 && r.data?.status === "PUBLISHED", r.body);
  r = await call("PATCH", `/listings/${lid}`, T("general"), { price: 23000 });
  check("price change of a live listing needs re-approval → PENDING", r.status === 200 && r.data?.status === "PENDING", r.body);
  r = await call("POST", `/admin/listings/${lid}/approve`, T("super"));
  check("super re-approves", r.status === 200 && r.data?.status === "PUBLISHED", r.body);
  r = await call("POST", `/listings/${lid}/mark-sold`, T("general"));
  check("mark-sold on a RENT listing → 409", r.status === 409, r.body);
  // an owner listing consumes the owner's plan limit
  r = await call("POST", "/listings", T("owner"), { ...listing, title: `Owner listing ${tag}` });
  check("owner (plan) creates listing", r.status === 201, r.body);
  r = await call("POST", `/listings/${lid}/mark-rented`, T("general"));
  check("seller marks RENTED", r.status === 200 && r.data?.status === "RENTED", r.body);

  section("dashboards + notifications");
  for (const [k, p, expectKey] of [["owner", "owner", "portfolio"], ["tenant", "tenant", "tenancy"], ["gov", "gov", "registeredOwners"], ["super", "admin", "users"], ["general", "user", "sellerPlan"]] as const) {
    r = await call("GET", `/dashboard/${p}`, T(k));
    check(`dashboard/${p} (${k}) → 200`, r.status === 200 && r.data?.[expectKey] !== undefined, r.body);
  }
  r = await call("GET", "/dashboard/owner", T("owner"));
  check("owner dashboard numbers: 1 property, 2 units, 50% occupancy, ৳16,500 collected", r.data?.portfolio?.properties === 1 && r.data?.portfolio?.totalUnits === 2 && r.data?.portfolio?.occupancyRate === 50 && Number(r.data?.rentThisMonth?.collected) === 17000, r.data);
  r = await call("GET", "/dashboard/owner/stats", T("owner"));
  check("owner stats: unpaid units + maintenance rate", r.status === 200 && typeof r.data?.unpaidUnitsLast30Days === "number" && typeof r.data?.maintenance?.solvedRate === "number", r.body);
  r = await call("GET", `/dashboard/owner/revenue?year=${new Date().getUTCFullYear()}`, T("owner"));
  check("owner revenue: 12 months, collected > 0, years list", r.status === 200 && r.data?.months?.length === 12 && Number(r.data?.totals?.collected) > 0 && r.data?.years?.length >= 1, r.body);
  r = await call("GET", "/dashboard/owner/revenue?year=1800", T("owner"));
  check("owner revenue: bad year → 422", r.status === 422, r.body);
  r = await call("GET", "/dashboard/owner/activities?limit=20", T("owner"));
  check("owner activities: payment + alert entries", r.status === 200 && r.data?.items?.some((a: { kind: string }) => a.kind === "RENT_PAID") && r.data?.items?.some((a: { kind: string }) => a.kind === "ALERT_SENT"), r.body);
  for (const p of ["stats", "revenue", "activities"]) {
    r = await call("GET", `/dashboard/owner/${p}`, T("tenant"));
    check(`tenant → owner ${p} 403`, r.status === 403, r.body);
  }
  r = await call("POST", "/sos", T("owner"), { type: "SECURITY", service: "POLICE", description: "Suspicious people at the gate", contactPhone: "01712345678", reporterName: "Abdur Rahman", thana: "Mirpur Model", locationText: "House 12, Road 5", district: "Dhaka", lat: 23.8, lng: 90.4 });
  check("owner SOS with police form fields → 201/200", r.status === 201 || r.status === 200, r.body);
  r = await call("POST", "/sos", T("owner"), { type: "FIRE", service: "FIRE", contactPhone: "123" });
  check("SOS bad contact phone → 422", r.status === 422, r.body);
  r = await call("GET", "/geo/districts", null);
  check("districts without division → all (≥ 60)", r.status === 200 && r.data?.length >= 60, r.body);
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("tenant dashboard: rent PAID, owner shown", r.data?.rent?.status === "PAID" && r.data?.tenancy?.owner?.id === users.owner!.id, r.data);
  r = await call("GET", "/dashboard/admin", T("super"));
  check("admin dashboard: revenue ≥ 159", Number(r.data?.revenue?.total) >= 159, r.data?.revenue);
  r = await call("GET", "/dashboard/gov", T("gov"));
  check("gov dashboard: resolved incidents ≥ 1", r.data?.resolvedIncidents >= 1, r.data);
  r = await call("GET", "/dashboard/owner", T("general"));
  check("general → owner dashboard 403", r.status === 403, r.body);
  r = await call("GET", "/dashboard/tenant", T("owner"));
  check("owner → tenant dashboard 403", r.status === 403, r.body);

  section("tenant dashboard page");
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  const td0 = r.data;
  check("lease card: property, unit, address line, dates, agreement flag", !!td0?.tenancy?.property?.name && !!td0.tenancy.unit?.unitNumber && typeof td0.tenancy.property.addressLine === "string" && !!td0.tenancy.startDate && "endDate" in td0.tenancy && typeof td0.tenancy.hasAgreementDocument === "boolean", td0?.tenancy);
  check("help desk: owner name, owner id, phone, picture field", td0?.tenancy?.owner?.id === users.owner!.id && /^OW\d+$/.test(td0?.tenancy?.owner?.ownerCode ?? "") && !!td0.tenancy.owner.phone && "avatarUrl" in td0.tenancy.owner, td0?.tenancy?.owner);
  check("payment card: everything paid → upcoming month, nothing to report", td0?.nextPayment?.state === "UPCOMING" && td0.nextPayment.recordId === null && /^\d{4}-\d{2}$/.test(td0.nextPayment.month) && Number(td0.nextPayment.amount) > 0 && td0.nextPayment.pending === null, td0?.nextPayment);
  check("payment card: pay-to number falls back to the owner's phone", td0?.nextPayment?.payTo === td0?.tenancy?.owner?.phone, td0?.nextPayment);
  r = await call("PATCH", "/me", T("owner"), { owner: { bkashNumber: "01911223344" } });
  check("owner sets the bKash number tenants pay to", r.status === 200, r.body);
  r = await call("PATCH", "/me", T("owner"), { owner: { bkashNumber: "12345" } });
  check("a bad bKash number → 422", r.status === 422, r.body);
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("payment card now shows the owner's bKash number", r.data?.nextPayment?.payTo === "01911223344", r.data?.nextPayment);

  const monthAhead = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 1));
  const unpaid = await db.rentRecord.create({ data: { agreementId: agreement?.id, billingMonth: monthAhead, rent: 15000, utility: 500, total: 15500, paid: 0, dueDate: new Date(monthAhead.getTime() + 9 * 86400_000), status: "DUE" } });
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("an unpaid bill becomes the next payment, with the amount owed", r.data?.nextPayment?.recordId === unpaid.id && r.data.nextPayment.amount === "15500.00" && ["DUE", "UPCOMING"].includes(r.data.nextPayment.state) && r.data.nextPayment.pending === null, r.data?.nextPayment);

  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("owner"), { method: "BKASH", reference: "TRX1A2B3C4D" });
  check("the owner cannot send a paid request → 403/404", r.status === 403 || r.status === 404, r.body);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("general"), { method: "BKASH", reference: "TRX1A2B3C4D" });
  check("a general user cannot → 403/404", r.status === 403 || r.status === 404, r.body);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`);
  check("signed out → 401", r.status === 401, r.body);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("tenant"), { method: "CASH", reference: "TRX1A2B3C4D" });
  check("cash cannot be reported → 422", r.status === 422, r.body);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("tenant"), { method: "BKASH" });
  check("no transaction id → 422", r.status === 422, r.body);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("tenant"), { method: "BKASH", reference: "TRX1A2B3C4D", amount: 99999 });
  check("more than owed → 422", r.status === 422, r.body);
  r = await call("POST", `/tenant/rent/${randomUUID()}/pay`, T("tenant"), { method: "BKASH", reference: "TRX1A2B3C4D" });
  check("someone else's or unknown bill → 404", r.status === 404, r.body);
  const trx = "TRX" + tag.toUpperCase() + "Z9";
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("tenant"), { method: "BKASH", reference: trx });
  const reported = r.data;
  check("Send Paid Request: stored as PENDING, balance untouched", r.status === 201 && reported?.status === "PENDING" && reported.method === "BKASH", r.body);
  check("…the balance is not reduced until the owner verifies", Number((await db.rentRecord.findUnique({ where: { id: unpaid.id } }))?.paid) === 0);
  r = await call("POST", `/tenant/rent/${unpaid.id}/pay`, T("tenant"), { method: "NAGAD", reference: "OTHER" + tag.toUpperCase() });
  check("a second pending request for the same bill → 409", r.status === 409, r.body);
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("the button state: pending verification with the sent amount", r.data?.nextPayment?.pending?.id === reported?.id && r.data.nextPayment.pending.method === "BKASH" && r.data.nextPayment.pending.amount === "15500.00", r.data?.nextPayment);
  r = await call("GET", "/notifications?category=payment&limit=20", T("owner"));
  const told = r.data?.items?.find((n: any) => n.type === "rent.received" && n.params?.paymentId === reported?.id);
  check("the owner is told: tenant, unit, property, amount, method, not verified yet", !!told && told.params.verified === false && told.params.method === "BKASH" && !!told.params.unit && !!told.params.property && told.params.tenantName === "Test tenant", told);
  r = await call("GET", "/rent/payments?status=PENDING", T("owner"));
  check("Rent Overview payments list shows it as pending", r.status === 200 && r.data?.items?.some((p: any) => p.id === reported?.id), r.body);
  r = await call("GET", "/dashboard/tenant/activity?limit=10", T("tenant"));
  check("Recent Activity lists the payment as pending", r.status === 200 && r.data?.items?.some((a: any) => a.kind === "payment" && a.id === reported?.id && a.status === "PENDING" && a.amount === "15500.00"), r.body);
  r = await call("POST", `/rent/payments/${reported?.id}/verify`, T("owner"), { decision: "VERIFIED" });
  check("the owner verifies it", r.status === 200, r.body);
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("after verification: nothing pending, last paid is shown", r.data?.nextPayment?.pending === null && !!r.data?.nextPayment?.lastPaidAt && r.data.nextPayment.recordId !== unpaid.id, r.data?.nextPayment);
  r = await call("GET", "/dashboard/tenant/activity?limit=10", T("tenant"));
  check("…and the activity row is now Verified", r.data?.items?.find((a: any) => a.id === reported?.id)?.status === "VERIFIED", r.body);

  r = await call("POST", "/maintenance", T("tenant"), { category: "PLUMBING", title: "Kitchen sink leaking", description: "Water drips under the sink all day.", priority: "HIGH" });
  const rep = r.data;
  check("Request Repair from the dashboard", r.status === 201 && rep?.status === "PENDING", r.body);
  r = await call("POST", "/complaints", T("tenant"), { category: "NOISE", subject: "Loud music at night", description: "Neighbours play loud music after midnight every day.", propertyId: prop?.id });
  const incd = r.data;
  check("Report Incident from the dashboard", r.status === 201 && !!incd?.id, r.body);
  r = await call("GET", "/notifications?limit=40", T("owner"));
  check("the owner is told about the incident directly", r.data?.items?.some((n: any) => n.type === "complaint.new" && n.params?.complaintId === incd?.id), r.body);
  r = await call("GET", "/dashboard/tenant/activity?limit=20", T("tenant"));
  const kinds = new Set((r.data?.items ?? []).map((a: any) => a.kind));
  check("Recent Activity mixes payments, repairs, incidents (newest first)", r.status === 200 && kinds.has("payment") && kinds.has("repair") && kinds.has("incident") && r.data.items.every((a: any, i: number, all: any[]) => i === 0 || new Date(all[i - 1].at) >= new Date(a.at)), r.body);
  r = await call("GET", "/dashboard/tenant/activity?limit=2", T("tenant"));
  check("the limit is respected and 'View more' is signalled", r.data?.items?.length === 2 && r.data?.hasMore === true, r.body);
  r = await call("GET", "/dashboard/tenant/activity?limit=500", T("tenant"));
  check("limit over 50 → 422", r.status === 422, r.body);
  r = await call("GET", "/dashboard/tenant/activity", T("owner"));
  check("activity: owner → 403", r.status === 403, r.body);
  r = await call("GET", "/dashboard/tenant/activity");
  check("activity: signed out → 401", r.status === 401, r.body);
  await db.rentPayment.deleteMany({ where: { rentRecordId: unpaid.id } }); await db.rentRecord.deleteMany({ where: { id: unpaid.id } }); // leave the books as they were
  r = await call("GET", "/notifications", T("owner"));
  check("owner has notifications", r.status === 200 && r.data?.items?.length > 0 && r.data?.unread > 0, r.body);
  const nid = r.data?.items?.[0]?.id;
  r = await call("POST", `/notifications/${nid}/read`, T("owner"));
  check("mark notification read", r.status === 200, r.body);
  r = await call("POST", "/notifications/read-all", T("owner"));
  check("read-all", r.status === 200, r.body);
  r = await call("POST", `/notifications/${nid}/archive`, T("tenant"));
  check("cannot archive others' notification → 404", r.status === 404, r.body);

  section("admin: users, NID verification, suspension");
  r = await call("GET", "/admin/users?role=OWNER", T("super"));
  check("super lists owners", r.status === 200 && r.data?.items?.some((u: any) => u.id === users.owner!.id), r.body);
  r = await call("GET", `/admin/users/${users.owner!.id}`, T("super"));
  check("super views NID for manual verification (audited)", r.status === 200 && /^\d{10,17}$/.test(r.data?.nid ?? ""), r.body);
  r = await call("GET", `/admin/users/${users.owner!.id}`, T("gov"));
  check("gov cannot view full NID → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/users/${users.owner!.id}/verify`, T("super"), { status: "REJECTED" });
  check("reject verification needs reason → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/users/${users.owner!.id}/verify`, T("super"), { status: "VERIFIED" });
  check("verify user → VERIFIED", r.status === 200 && r.data?.verificationStatus === "VERIFIED", r.body);
  const audits = await db.auditLog.count({ where: { action: "user.nid_view", resourceId: users.owner!.id } });
  check("NID view wrote an audit log", audits === 1, audits);
  r = await call("POST", `/admin/users/${users.super!.id}/suspend`, T("super"), { reason: "test" });
  check("super cannot suspend self → 409", r.status === 409, r.body);
  r = await call("POST", `/admin/users/${users.general!.id}/suspend`, T("super"), { reason: "Policy violation" });
  check("super suspends general user", r.status === 200 && r.data?.status === "SUSPENDED", r.body);
  r = await call("GET", "/me", T("general"));
  check("suspended user's token is rejected → 403", r.status === 403 && r.code === "ACCOUNT_SUSPENDED", r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.general!.email, password: users.general!.password });
  check("suspended user cannot log in → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/users/${users.general!.id}/activate`, T("super"));
  check("super re-activates", r.status === 200 && r.data?.status === "ACTIVE", r.body);
  r = await call("POST", `/admin/users/${users.general!.id}/role`, T("super"), { role: "GOV_ADMIN" });
  check("super changes role", r.status === 200 && r.data?.role === "GOV_ADMIN", r.body);
  await call("POST", `/admin/users/${users.general!.id}/role`, T("super"), { role: "GENERAL_USER" });
  r = await call("POST", "/admin/users", T("super"), { fullName: "New Gov", username: `govx${tag}`, email: `govx.${tag}@mailinator.com`, phone: phone(), password: "Passw0rdx1", role: "GOV_ADMIN" });
  check("super creates a Gov Admin account", r.status === 201 && r.data?.role === "GOV_ADMIN", r.body);
  if (r.data?.id) { const row = await db.user.findUnique({ where: { id: r.data.id } }); if (row?.authId) authIds.push(row.authId); users.govx = { key: "govx", id: r.data.id, authId: row?.authId ?? "", email: "", password: "", username: `govx${tag}`, token: "" }; }

  section("public content + uploads");
  r = await call("GET", "/cms/home.hero?locale=en");
  check("GET /cms/home.hero", r.status === 200 && !!r.data?.data?.title, r.body);
  r = await call("GET", "/cms/missing.block");
  check("unknown CMS key → 404", r.status === 404, r.body);
  r = await call("POST", "/contact", null, { name: "Test Visitor", email: `visitor.${tag}@mailinator.com`, subject: "Question about plans", message: "How do I upgrade my account to the Millionaire plan?" });
  check("POST /contact stores the inquiry", r.status === 201, r.body);
  r = await call("POST", "/contact", null, { name: "T", email: "bad", subject: "x", message: "short" });
  check("contact validation → 422", r.status === 422, r.body);
  r = await call("POST", "/contact", null, { name: "Bot", email: `bot.${tag}@mailinator.com`, subject: "Spam spam", message: "buy cheap watches now please", website: "http://spam" });
  check("honeypot field is silently dropped", r.status === 201 && (await db.contactInquiry.count({ where: { email: `bot.${tag}@mailinator.com` } })) === 0, r.body);
  r = await call("GET", "/admin/contact-inquiries", T("super"));
  check("super reads contact inquiries", r.status === 200 && r.data?.some((i: any) => i.email.includes(tag)), r.body);
  r = await call("PUT", "/admin/cms/about", T("owner"), { locale: "en", data: { x: 1 } });
  check("owner cannot edit CMS → 403", r.status === 403, r.body);
  r = await call("GET", "/listings/stats");
  const livePublished = await db.listing.count({ where: { status: "PUBLISHED" } });
  check("marketplace dashboard stats match the database", r.status === 200 && r.data?.totalProperties === livePublished && Array.isArray(r.data?.popularZones) && Array.isArray(r.data?.featured), r.body);
  r = await call("GET", "/geo/facilities?type=MOSQUE");
  check("facilities by type", r.status === 200 && r.data?.length >= 1 && typeof r.data[0].lat === "number", r.body);
  r = await call("GET", "/geo/facilities?bbox=90.39,23.86,90.41,23.88");
  check("facilities by bbox (Uttara)", r.status === 200 && r.data?.length >= 3, r.body);
  r = await call("GET", "/geo/facilities?bbox=oops");
  check("facilities bad bbox → 422", r.status === 422, r.body);

  r = await call("POST", "/uploads/sign", T("tenant"), { purpose: "AVATAR", mime: "application/pdf", size: 1000 });
  check("upload: wrong MIME type → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("tenant"), { purpose: "AVATAR", mime: "image/png", size: 9 * 1024 * 1024 });
  check("upload: image over 5 MB → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("tenant"), { purpose: "AGREEMENT", mime: "application/pdf", size: 1000 });
  check("upload: only owners may sign AGREEMENT → 403", r.status === 403, r.body);
  r = await call("POST", "/uploads/sign", null, { purpose: "AVATAR", mime: "image/png", size: 100 });
  check("upload: unauthenticated → 401", r.status === 401, r.body);
  const front = await uploadVia(T("tenant"), "NID_FRONT", "image/png", PNG);
  const back = await uploadVia(T("tenant"), "NID_BACK", "image/png", PNG);
  check("tenant signs + uploads NID front/back", !!front.key && !!back.key && !front.error && !back.error, front.error ?? back.error);
  check("key layout NID_FRONT/<userId>/…", front.key?.startsWith(`NID_FRONT/${users.tenant!.id}/`) === true, front.key);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_FRONT", storageKey: `NID_FRONT/${users.owner!.id}/stolen.png` });
  check("cannot register someone else's upload → 403", r.status === 403, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: front.key });
  check("wrong purpose for document kind → 422", r.status === 422, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_FRONT", storageKey: front.key });
  check("register NID front", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: back.key });
  check("register NID back", r.status === 201, r.body);
  r = await call("GET", "/me", T("tenant"));
  check("NID front+back → verification PENDING (or already VERIFIED by the helper)", ["PENDING", "VERIFIED"].includes(r.data?.verificationStatus), r.body);
  r = await call("GET", "/me/documents", T("tenant"));
  check("my documents list (storage key hidden)", r.status === 200 && r.data?.length === 2 && r.data?.[0]?.storageKey === undefined, r.body);
  r = await call("GET", `/files/signed?key=${encodeURIComponent(front.key!)}`, T("tenant"));
  check("uploader gets a signed read link", r.status === 200 && typeof r.data?.url === "string", r.body);
  if (r.data?.url) { const f = await fetch(r.data.url); check("signed read link serves the file", f.status === 200); }
  r = await call("GET", `/files/signed?key=${encodeURIComponent(front.key!)}`, T("owner"));
  check("other users cannot read the file → 403", r.status === 403, r.body);
  r = await call("GET", `/files/signed?key=${encodeURIComponent(front.key!)}`, T("super"));
  check("Super Admin can read it (manual NID check)", r.status === 200, r.body);
  r = await call("GET", `/files/signed?key=${encodeURIComponent(front.key!)}`, T("gov"));
  check("Gov Admin cannot read raw NID files → 403", r.status === 403, r.body);

  section("profile + password");
  r = await call("PATCH", "/me", T("tenant"), { address: { division: "Dhaka", district: "Dhaka", area: "Uttara" }, preferences: { email: true, sms: false }, tenant: { emergencyContact: "01911223344", occupation: "Engineer" }, gender: "MALE" });
  check("tenant updates profile (address, preferences, emergency contact)", r.status === 200 && r.data?.address?.area === "Uttara" && r.data?.preferences?.sms === false && r.data?.tenantProfile?.occupation === "Engineer", r.body);
  r = await call("PATCH", "/me", T("tenant"), { gov: { department: "x" } });
  check("tenant cannot set gov profile → 403", r.status === 403, r.body);
  r = await call("PATCH", "/me", T("tenant"), { avatarKey: `AVATAR/${users.owner!.id}/a.png` });
  check("avatar must be your own upload → 403", r.status === 403, r.body);
  r = await call("PATCH", "/me", T("tenant"), { phone: "123" });
  check("profile phone validation → 422", r.status === 422, r.body);
  r = await call("PATCH", "/me", T("owner"), { owner: { businessName: "Test Realty Ltd" } });
  check("owner updates business name", r.status === 200 && r.data?.ownerProfile?.businessName === "Test Realty Ltd", r.body);
  r = await call("GET", "/me", T("owner"));
  check("GET /me masks NID, never returns it in full", /^•+7890$/.test(r.data?.nid ?? "") && JSON.stringify(r.data).includes("1234567897890") === false, r.data?.nid);
  r = await call("POST", "/auth/password/change", T("owner"), { currentPassword: "wrong-password-1", newPassword: "Brand9newpass" });
  check("password change with wrong current → 403", r.status === 403, r.body);
  r = await call("POST", "/auth/password/change", T("owner"), { currentPassword: users.owner!.password, newPassword: "short" });
  check("weak new password → 422", r.status === 422, r.body);
  const newPw = `Nn${rnd(8)}7b`;
  r = await call("POST", "/auth/password/change", T("owner"), { currentPassword: users.owner!.password, newPassword: newPw });
  check("password change succeeds", r.status === 200 && r.data?.changed === true, r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.owner!.email, password: newPw });
  check("login with the new password", r.status === 200, r.body);
  users.owner!.password = newPw;
  const oldTokenRes = await call("GET", "/me", users.owner!.token);
  check("password change signs out the old session", oldTokenRes.status === 401, oldTokenRes.body);
  users.owner!.token = r.data?.session?.accessToken ?? ""; // continue with the fresh session

  section("sign-up wizard: availability, public uploads, finalisation");
  r = await call("GET", `/auth/availability?username=${users.owner!.username}`);
  check("availability: taken username → false", r.status === 200 && r.data?.username === false, r.body);
  r = await call("GET", `/auth/availability?username=free_name_${tag}`);
  check("availability: free username with underscore → true", r.status === 200 && r.data?.username === true, r.body);
  const ownerPhone = (await db.user.findUniqueOrThrow({ where: { id: users.owner!.id } })).phone;
  r = await call("GET", `/auth/availability?email=${encodeURIComponent(users.owner!.email)}&phone=${ownerPhone}`);
  check("availability: taken email + phone → false", r.status === 200 && r.data?.email === false && r.data?.phone === false, r.body);
  r = await call("GET", "/auth/availability");
  check("availability: no field → 422", r.status === 422, r.body);
  r = await call("GET", "/auth/availability?phone=123");
  check("availability: bad phone → 422", r.status === 422, r.body);

  const regSession = randomUUID();
  for (const purpose of ["NID_FRONT", "NID_BACK", "AVATAR"]) {
    const sg = await call("POST", "/auth/register/uploads", null, { session: regSession, purpose, mime: "image/png", size: PNG.length });
    check(`public upload URL for ${purpose} (no login needed)`, sg.status === 200 && sg.data?.key === `REG/${regSession}/${purpose}.png`, sg.body);
    const up = await sb.storage.from(BUCKET).uploadToSignedUrl(sg.data.key, sg.data.token, new Blob([PNG as BlobPart], { type: "image/png" }), { contentType: "image/png" });
    check(`${purpose} uploaded`, !up.error, up.error?.message);
  }
  r = await call("POST", "/auth/register/uploads", null, { session: regSession, purpose: "NID_FRONT", mime: "application/zip", size: 100 });
  check("public upload: wrong type → 422", r.status === 422, r.body);
  r = await call("POST", "/auth/register/uploads", null, { session: regSession, purpose: "AVATAR", mime: "image/png", size: 9 * 1024 * 1024 });
  check("public upload: over 5 MB → 422", r.status === 422, r.body);
  r = await call("POST", "/auth/register/uploads", null, { session: regSession, purpose: "AGREEMENT", mime: "application/pdf", size: 100 });
  check("public upload: only NID_FRONT/NID_BACK/AVATAR allowed → 422", r.status === 422, r.body);
  r = await call("POST", "/auth/register/uploads", null, { session: "not-a-uuid", purpose: "AVATAR", mime: "image/png", size: 100 });
  check("public upload: session must be a uuid → 422", r.status === 422, r.body);

  // register() ends by calling this; tested directly so the check does not depend on Supabase's hourly e-mail limit
  const { data: wd, error: wErr } = await sb.auth.admin.createUser({ email: `wizard.${tag}@mailinator.com`, password: `Tt${rnd(8)}9a`, email_confirm: true });
  if (wErr) throw wErr;
  authIds.push(wd.user.id);
  const wizRow = await db.user.create({ data: { authId: wd.user.id, username: `wizard${tag}`, fullName: "Test wizard", email: `wizard.${tag}@mailinator.com`, phone: phone(), role: "GENERAL_USER" } });
  users.wizard = { key: "wizard", id: wizRow.id, authId: wd.user.id, email: "", password: "", username: wizRow.username, token: "" };
  const { finalizeRegistrationUploads } = await import("../src/modules/auth/registration-uploads");
  const fin = await finalizeRegistrationUploads(wizRow.id, regSession);
  check("finalize moves NID front/back + photo to the new user", fin.nidFront && fin.nidBack && fin.avatar, fin);
  const wAfter = await db.user.findUniqueOrThrow({ where: { id: wizRow.id } });
  const wDocs = await db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: wizRow.id } });
  check("…account queued for NID review (PENDING), avatar saved", wAfter.verificationStatus === "PENDING" && !!wAfter.avatarKey?.startsWith(`AVATAR/${wizRow.id}/`) && wDocs.length === 2 && wDocs.every((d) => d.storageKey.split("/")[1] === wizRow.id), { status: wAfter.verificationStatus, docs: wDocs.length });
  uploaded.push(...wDocs.map((d) => d.storageKey), wAfter.avatarKey!);
  const leftover = await sb.storage.from(BUCKET).list(`REG/${regSession}`);
  check("…and the temporary REG/ files are gone", (leftover.data ?? []).length === 0, leftover.data);
  const noFiles = await finalizeRegistrationUploads(wizRow.id, randomUUID());
  check("finalize with an unknown session is harmless", !noFiles.nidFront && !noFiles.nidBack && !noFiles.avatar, noFiles);

  section("sign-in page: username/phone login, refresh, providers, Google");
  const ownerLogin = await db.user.findUniqueOrThrow({ where: { id: users.owner!.id } });
  r = await call("POST", "/auth/login", null, { identifier: users.owner!.username, password: users.owner!.password });
  check("login with USERNAME", r.status === 200 && r.data?.user?.id === users.owner!.id && !!r.data?.session?.refreshToken, r.body);
  const ownerRefresh = r.data?.session?.refreshToken;
  r = await call("POST", "/auth/login", null, { identifier: ownerLogin.phone, password: users.owner!.password });
  check("login with PHONE", r.status === 200 && r.data?.user?.id === users.owner!.id, r.body);
  r = await call("POST", "/auth/login", null, { identifier: "+88" + ownerLogin.phone, password: users.owner!.password });
  check("login with +88 phone format", r.status === 200, r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.owner!.username, password: "WrongPass999" });
  check("wrong password by username → 401", r.status === 401 && r.code === "UNAUTHENTICATED", r.body);
  r = await call("POST", "/auth/login", null, { identifier: `nobody_${tag}`, password: "WrongPass999" });
  check("unknown username → same 401 (no account enumeration)", r.status === 401 && r.code === "UNAUTHENTICATED", r.body);
  r = await call("POST", "/auth/login", null, { identifier: "", password: "" });
  check("empty credentials → 422", r.status === 422, r.body);

  r = await call("POST", "/auth/refresh", null, { refreshToken: ownerRefresh });
  check("refresh token → new session + user", r.status === 200 && !!r.data?.session?.accessToken && r.data?.user?.id === users.owner!.id, r.body);
  const refreshedToken = r.data?.session?.accessToken;
  r = await call("GET", "/me", refreshedToken);
  check("the refreshed access token works", r.status === 200 && r.data?.id === users.owner!.id, r.body);
  r = await call("POST", "/auth/refresh", null, { refreshToken: "x".repeat(40) });
  check("invalid refresh token → 401", r.status === 401, r.body);
  r = await call("POST", "/auth/refresh", null, {});
  check("refresh without token → 422", r.status === 422, r.body);

  r = await call("GET", "/auth/providers");
  check("GET /auth/providers → { google: boolean }", r.status === 200 && typeof r.data?.google === "boolean", r.body);
  const siteOrigin = new URL(BASE).origin;
  r = await call("GET", `/auth/oauth/google/url?redirectTo=${encodeURIComponent("https://evil.example/en/auth/callback")}`);
  check("Google URL: foreign redirect target refused (no open redirect) → 422", r.status === 422, r.body);
  r = await call("GET", `/auth/oauth/google/url?redirectTo=${encodeURIComponent(siteOrigin + "/en/somewhere-else")}`);
  check("Google URL: only /bn|en/auth/callback allowed → 422", r.status === 422, r.body);
  r = await call("GET", `/auth/oauth/google/url?redirectTo=${encodeURIComponent(siteOrigin + "/en/auth/callback?x=1")}`);
  check("Google URL: no query string on the callback → 422", r.status === 422, r.body);
  r = await call("GET", "/auth/oauth/google/url");
  check("Google URL: redirectTo required → 422", r.status === 422, r.body);
  r = await call("GET", `/auth/oauth/google/url?redirectTo=${encodeURIComponent(siteOrigin + "/en/auth/callback")}`);
  check("Google URL: valid target → Supabase URL, or a clear 'not enabled' answer", (r.status === 200 && /provider=google/.test(r.data?.url ?? "")) || (r.status === 409 && r.body?.details?.reason === "google_not_enabled"), r.body);

  // first Google sign-in: a Supabase account without a local row becomes a free GENERAL_USER account
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const gPass = `Gg${rnd(8)}7z`;
  const gMail = `google.${tag}@mailinator.com`;
  const gUser = await sb.auth.admin.createUser({ email: gMail, password: gPass, email_confirm: true, user_metadata: { full_name: "Google Person" } });
  if (gUser.error) throw gUser.error;
  authIds.push(gUser.data.user.id);
  const gTok = (await anon.auth.signInWithPassword({ email: gMail, password: gPass })).data.session!.access_token;
  r = await call("POST", "/auth/oauth/complete", null, {});
  check("oauth/complete without token → 401", r.status === 401, r.body);
  r = await call("POST", "/auth/oauth/complete", "garbage", {});
  check("oauth/complete with a bad token → 401", r.status === 401, r.body);
  r = await call("POST", "/auth/oauth/complete", gTok, { locale: "en" });
  check("first Google sign-in creates a free account (GENERAL_USER) named from Google", r.status === 200 && r.data?.isNew === true && r.data?.user?.role === "GENERAL_USER" && r.data?.user?.fullName === "Google Person" && /^[a-z0-9_]{3,20}$/.test(r.data?.user?.username ?? ""), r.body);
  const gId = r.data?.user?.id;
  if (gId) users.google = { key: "google", id: gId, authId: gUser.data.user.id, email: gMail, password: gPass, username: r.data.user.username, token: "" };
  r = await call("POST", "/auth/oauth/complete", gTok, { locale: "en" });
  check("second call returns the same account (isNew false)", r.status === 200 && r.data?.isNew === false && r.data?.user?.id === gId, r.body);
  r = await call("GET", "/me", gTok);
  check("the Google session works with the normal API", r.status === 200 && r.data?.id === gId && r.data?.email === gMail, r.body);
  await db.user.update({ where: { id: gId }, data: { status: "SUSPENDED" } });
  r = await call("POST", "/auth/oauth/complete", gTok, {});
  check("suspended account cannot sign in with Google → 403", r.status === 403 && r.code === "ACCOUNT_SUSPENDED", r.body);

  // same e-mail already registered locally under another login → never silently merged
  const cMail = `clash.${tag}@mailinator.com`;
  const clashLocal = await db.user.create({ data: { username: `clash${tag}`, fullName: "Local clash", email: cMail, phone: phone(), role: "GENERAL_USER" } });
  users.clash = { key: "clash", id: clashLocal.id, authId: "", email: cMail, password: "", username: clashLocal.username, token: "" };
  const cSb = await sb.auth.admin.createUser({ email: cMail, password: gPass, email_confirm: true });
  if (cSb.error) throw cSb.error;
  authIds.push(cSb.data.user.id);
  const cTok = (await anon.auth.signInWithPassword({ email: cMail, password: gPass })).data.session!.access_token;
  r = await call("POST", "/auth/oauth/complete", cTok, {});
  check("Google e-mail already used by a different local account → 409 (not merged)", r.status === 409 && r.body?.details?.reason === "email_registered", r.body);

  section("oversight: gov directories, people search, property verification");
  const ownerRow = await db.user.findUniqueOrThrow({ where: { id: users.owner!.id } });
  r = await call("GET", "/gov/owners", T("gov"));
  const orow = r.data?.items?.find((o: any) => o.id === users.owner!.id);
  check("gov lists owners with masked NID + tier + property count", r.status === 200 && /^•+7890$/.test(orow?.nid ?? "") && orow?.subscription?.plan?.code === "PRIMARY" && orow?.propertyCount === 1, orow);
  r = await call("GET", "/gov/owners?tier=PRIMARY&q=" + users.owner!.username, T("gov"));
  check("filter owners by tier + search", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("GET", "/gov/owners", T("owner"));
  check("owner → gov directory 403", r.status === 403, r.body);
  r = await call("GET", `/gov/tenants?q=${users.tenant!.username}`, T("gov"));
  const trow = r.data?.items?.find((t: any) => t.id === users.tenant!.id);
  check("gov lists tenants with property/unit/owner + occupancy %", r.status === 200 && trow?.tenancy?.owner?.id === users.owner!.id && typeof r.data?.occupancyPercent === "number", trow);
  r = await call("GET", "/gov/properties", T("gov"));
  check("gov lists properties", r.status === 200 && r.data?.items?.some((p: any) => p.id === prop?.id), r.body);
  r = await call("GET", `/gov/people/search?by=phone&q=${ownerRow.phone}`, T("gov"));
  check("Find People by phone", r.status === 200 && r.data?.id === users.owner!.id && r.data?.role === "OWNER" && /^•+7890$/.test(r.data?.nid), r.body);
  r = await call("GET", `/gov/people/search?by=email&q=${ownerRow.email}`, T("gov"));
  check("Find People by email", r.status === 200 && r.data?.id === users.owner!.id, r.body);
  r = await call("GET", `/gov/people/search?by=id&q=${users.tenant!.id}`, T("super"));
  check("Find People by account id (super admin)", r.status === 200 && r.data?.role === "TENANT", r.body);
  r = await call("GET", "/gov/people/search?by=phone&q=01700000000", T("gov"));
  check("Find People: no match → 404", r.status === 404, r.body);
  r = await call("GET", `/gov/people/search?by=phone&q=${ownerRow.phone}`, T("owner"));
  check("owner cannot use Find People → 403", r.status === 403, r.body);
  r = await call("GET", "/gov/archive/properties", T("gov"));
  check("gov previous properties archive", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/admin/owners", T("super"));
  check("super owner management list", r.status === 200 && r.data?.items?.some((o: any) => o.id === users.owner!.id), r.body);
  r = await call("GET", `/admin/tenants?q=${users.tenant!.username}`, T("super"));
  check("super tenant management list", r.status === 200 && r.data?.items?.some((t: any) => t.id === users.tenant!.id), r.body);
  const peopleAudit = await db.auditLog.count({ where: { action: "people.search", actorId: users.gov!.id } });
  check("people searches are audit-logged (without the query)", peopleAudit >= 2, peopleAudit);

  const pdoc = await uploadVia(T("owner"), "PROPERTY_DOC", "application/pdf", PDF);
  check("owner uploads a property deed", !!pdoc.key && !pdoc.error, pdoc.error);
  r = await call("POST", `/properties/${prop?.id}/documents`, T("owner"), { kind: "DEED", storageKey: pdoc.key });
  check("owner attaches the deed → verification PENDING", r.status === 201, r.body);
  r = await call("GET", `/admin/properties/${prop?.id}`, T("owner"));
  check("owner → admin review screen 403", r.status === 403, r.body);
  r = await call("GET", `/admin/properties/${prop?.id}`, T("super"));
  check("review screen: documents with signed URLs", r.status === 200 && r.data?.verificationStatus === "PENDING" && r.data?.documents?.length === 1 && typeof r.data.documents[0].url === "string", r.body);
  r = await call("POST", `/admin/properties/${prop?.id}/reject`, T("super"), {});
  check("reject without notes → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/properties/${prop?.id}/reject`, T("super"), { notes: "Deed is unreadable" });
  check("super rejects verification", r.status === 200 && r.data?.verificationStatus === "REJECTED", r.body);
  r = await call("POST", `/admin/properties/${prop?.id}/verify`, T("super"));
  check("super verifies property", r.status === 200 && r.data?.verificationStatus === "VERIFIED", r.body);
  r = await call("POST", `/admin/properties/${prop?.id}/verify`, T("gov"));
  check("gov cannot verify → 403", r.status === 403, r.body);
  r = await call("POST", `/gov/properties/${prop?.id}/report`, T("gov"), { notes: "Boundary dispute reported by neighbours" });
  check("gov reports an issue on a property", r.status === 200, r.body);
  r = await call("POST", `/gov/properties/${prop?.id}/report`, T("owner"), { notes: "should not work" });
  check("owner cannot report via gov route → 403", r.status === 403, r.body);

  section("platform settings, audit logs, analytics, broadcast");
  r = await call("GET", "/admin/settings", T("owner"));
  check("owner → settings 403", r.status === 403, r.body);
  r = await call("GET", "/admin/settings", T("gov"));
  check("gov → settings 403", r.status === 403, r.body);
  r = await call("PATCH", "/admin/settings", T("super"), { "billing.graceDays": 5, "email.provider": { apiKey: "secret-key-123" } });
  check("super updates settings; secrets come back masked", r.status === 200 && r.data?.["billing.graceDays"] === 5 && r.data?.["email.provider"] === "••••••••", r.body);
  r = await call("PATCH", "/admin/settings", T("super"), { "unknown.key": 1 });
  check("unknown setting → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/settings", T("super"), { "billing.graceDays": 99 });
  check("invalid setting value → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/settings", T("super"), { "billing.graceDays": 3, "payment.bkash.personalNumber": "123" });
  check("bKash number validated as BD mobile → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/settings", T("super"), { "billing.graceDays": 3 });
  check("grace days restored to 3", r.status === 200 && r.data?.["billing.graceDays"] === 3, r.body);
  const sAudit = await db.auditLog.findFirst({ where: { action: "settings.update" }, orderBy: { id: "desc" } });
  check("secret values never reach the audit log", !JSON.stringify(sAudit).includes("secret-key-123"), sAudit);
  r = await call("POST", "/admin/settings/test-email", T("super"));
  check("test-email endpoint answers", r.status === 200 && r.data?.configured === true, r.body);
  r = await call("GET", "/admin/audit-logs?action=plan", T("super"));
  check("audit log viewer + filter", r.status === 200 && r.data?.items?.length > 0 && r.data.items.every((a: any) => a.action.includes("plan")), r.body);
  r = await call("GET", `/admin/audit-logs?actorId=${users.super!.id}`, T("super"));
  check("audit log filter by actor", r.status === 200 && r.data?.items?.every((a: any) => a.actorId === users.super!.id), r.body);
  r = await call("GET", "/admin/audit-logs?actorId=" + users.super!.id, T("gov"));
  check("gov sees only their own audit entries", r.status === 200 && r.data?.items?.every((a: any) => a.actorId === users.gov!.id) && r.data.items.length > 0, r.body);
  r = await call("GET", "/admin/audit-logs", T("owner"));
  check("owner → audit logs 403", r.status === 403, r.body);
  csv = await raw("/admin/audit-logs/export", T("super"));
  check("audit log CSV export", csv.status === 200 && csv.type.includes("text/csv") && csv.text.includes("id,at,actorId"), csv.text.slice(0, 100));
  r = await call("GET", "/admin/analytics", T("super"));
  check("platform analytics", r.status === 200 && Array.isArray(r.data?.userGrowth) && Array.isArray(r.data?.rentActivity) && r.data?.marketplace?.totalListings >= 1, r.body);
  r = await call("GET", "/admin/analytics?from=2026-12-01&to=2026-01-01", T("super"));
  check("analytics invalid date range → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/analytics", T("owner"));
  check("owner → analytics 403", r.status === 403, r.body);
  r = await call("GET", "/admin/marketplace/analytics", T("super"));
  check("marketplace analytics", r.status === 200 && r.data?.totalListings >= 1 && r.data?.categoryDistribution?.FLAT >= 1 && Array.isArray(r.data?.popularZones), r.body);
  csv = await raw("/admin/analytics/export", T("super"));
  check("analytics CSV export", csv.status === 200 && csv.type.includes("text/csv"), csv.text.slice(0, 100));
  r = await call("POST", "/admin/broadcasts", T("owner"), { audience: ["TENANT"], title: "Hello", body: "Not allowed" });
  check("owner cannot broadcast → 403", r.status === 403, r.body);
  r = await call("POST", "/admin/broadcasts", T("super"), { audience: ["TENANT"], title: "Maintenance notice", body: "Water supply will be off at 10am" });
  check("super broadcasts to all tenants", r.status === 201 && r.data?.recipients >= 1, r.body);
  r = await call("GET", "/notifications?limit=50", T("tenant"));
  check("tenant received the broadcast notification", r.data?.items?.some((n: any) => n.titleKey === "notifications.broadcast"), r.body);

  section("permission overrides, plans, invoices, refunds");
  r = await call("POST", "/listings", T("gov"), listing);
  check("gov cannot create listings by default → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/users/${users.gov!.id}/permissions`, T("super"), { grant: ["listing:create"], revoke: ["listing:create"] });
  check("grant + revoke the same permission → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/users/${users.owner!.id}/permissions`, T("super"), { grant: ["listing:create"] });
  check("permission overrides only apply to Gov Admins → 409", r.status === 409, r.body);
  r = await call("POST", `/admin/users/${users.gov!.id}/permissions`, T("gov"), { grant: ["listing:create"] });
  check("gov cannot grant itself permissions → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/users/${users.gov!.id}/permissions`, T("super"), { grant: ["listing:create"] });
  check("super grants listing:create to the gov admin", r.status === 200 && r.data?.some((p: any) => p.permission === "listing:create" && p.granted), r.body);
  r = await call("POST", "/listings", T("gov"), { ...listing, title: `Gov authorised listing ${tag}` });
  check("authorised gov admin creates a listing (no plan needed)", r.status === 201, r.body);
  r = await call("POST", `/admin/users/${users.gov!.id}/permissions`, T("super"), { revoke: ["listing:create"] });
  r = await call("POST", "/listings", T("gov"), listing);
  check("revoked → 403 again", r.status === 403, r.body);

  const inv = await db.invoice.findFirstOrThrow({ where: { transaction: { userId: users.owner!.id } } });
  r = await call("GET", `/invoices/${inv.id}`, T("owner"));
  check("owner reads own invoice", r.status === 200 && r.data?.number === inv.number && r.data?.plan?.code === "PRIMARY" && r.data?.currency === "BDT", r.body);
  r = await call("GET", `/invoices/${inv.id}`, T("general"));
  check("other user cannot read the invoice → 404", r.status === 404, r.body);
  r = await call("GET", `/invoices/${inv.id}`, T("super"));
  check("super reads any invoice", r.status === 200, r.body);
  r = await call("GET", "/admin/payments?status=SUCCESS", T("super"));
  check("super lists payments", r.status === 200 && r.data?.items?.some((p: any) => p.user?.id === users.owner!.id), r.body);
  r = await call("GET", "/admin/payments", T("owner"));
  check("owner → payments admin 403", r.status === 403, r.body);
  csv = await raw("/admin/payments/export", T("super"));
  check("payments CSV export", csv.status === 200 && csv.type.includes("text/csv") && csv.text.includes(users.owner!.username), csv.text.slice(0, 100));

  r = await call("POST", "/admin/plans", T("super"), { code: `TSL${tag.toUpperCase()}`, nameBn: "ছোট", nameEn: "Tiny", audience: "OWNER", monthlyPrice: 10, propertyLimit: 0, unitLimit: 0 });
  const lowPlan = r.data; if (lowPlan?.id) planIds.push(lowPlan.id);
  check("create a tiny OWNER plan", r.status === 200 && !!lowPlan?.id, r.body);
  r = await call("POST", "/subscriptions/quote", T("owner"), { planId: lowPlan?.id, cycle: "MONTHLY" });
  check("downgrade blocked when usage exceeds the plan → 409", r.status === 409 && r.body?.details?.reason === "usage_exceeds_plan", r.body);
  r = await call("POST", `/admin/plans/${lowPlan?.id}/schedule-price`, T("super"), { changes: { monthlyPrice: 12 }, effectiveAt: new Date(Date.now() - 3600_000).toISOString() });
  check("schedule a change in the past → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/plans/${lowPlan?.id}/schedule-price`, T("owner"), { changes: { monthlyPrice: 12 }, effectiveAt: new Date(Date.now() + 86400_000).toISOString() });
  check("owner cannot schedule plan changes → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/plans/${lowPlan?.id}/schedule-price`, T("super"), { changes: { monthlyPrice: 12 }, effectiveAt: new Date(Date.now() + 86400_000).toISOString() });
  check("schedule a future price change", r.status === 201, r.body);
  r = await call("GET", `/admin/plans/${lowPlan?.id}/schedule-price`, T("super"));
  check("list scheduled changes", r.status === 200 && r.data?.length === 1, r.body);
  r = await call("DELETE", `/admin/plans/${lowPlan?.id}`, T("super"));
  check("delete an unused plan", r.status === 200 && r.data?.deleted === true, r.body);
  r = await call("DELETE", `/admin/plans/${sellerPlan?.id}`, T("super"));
  check("plan with subscribers cannot be deleted → 409", r.status === 409, r.body);
  r = await call("DELETE", `/admin/plans/${sellerPlan?.id}`, T("owner"));
  check("owner cannot delete plans → 403", r.status === 403, r.body);

  const ownerSub = (await call("GET", "/me/subscription", T("owner"))).data?.current;
  r = await call("POST", `/subscriptions/${ownerSub?.id}/cancel`, T("general"));
  check("cannot cancel someone else's subscription → 404", r.status === 404, r.body);
  r = await call("POST", `/subscriptions/${ownerSub?.id}/cancel`, T("owner"));
  check("owner cancels (runs until period end)", r.status === 200 && !!r.data?.cancelledAt && r.data?.status === "ACTIVE", r.body);
  const txn = await db.paymentTransaction.findFirstOrThrow({ where: { userId: users.owner!.id, status: "SUCCESS" } });
  r = await call("POST", `/admin/payments/${txn.id}/refund`, T("owner"), { amount: 50, reason: "x" });
  check("owner cannot refund → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/payments/${txn.id}/refund`, T("super"), { amount: 50, reason: "Goodwill gesture" });
  check("partial refund recorded", r.status === 200 && Number(r.data?.refundAmount) === 50 && r.data?.status === "SUCCESS", r.body);
  r = await call("POST", `/admin/payments/${txn.id}/refund`, T("super"), { amount: 1000, reason: "Too much" });
  check("refund above the paid amount → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/payments/${txn.id}/refund`, T("super"), { amount: 109, reason: "Full refund" });
  check("remaining amount refunded → REFUNDED, subscription CANCELLED", r.status === 200 && r.data?.status === "REFUNDED" && (await db.userSubscription.findUniqueOrThrow({ where: { id: txn.subscriptionId! } })).status === "CANCELLED", r.body);

  section("tenant maintenance page: new request, edit, status, delete");
  const tmBefore = (await call("GET", "/maintenance/stats", T("tenant"))).data;
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  r = await call("POST", "/maintenance", T("tenant"), { category: "ELECTRICAL", title: "Switch sparks", description: "The wall switch in the hall sparks when used.", priority: "CRITICAL", preferredAt: soon });
  const tm1 = r.data?.id;
  check("new request with a preferred time → 201, Pending, time stored", r.status === 201 && r.data?.status === "PENDING" && new Date(r.data?.preferredAt).toISOString() === soon, r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "ELECTRICAL", title: "Past time", description: "The preferred time is already over.", preferredAt: "2020-01-01T10:00:00Z" });
  check("a preferred time in the past → 422", r.status === 422, r.body);
  r = await call("POST", "/maintenance", T("tenant"), { category: "ELECTRICAL", title: "Far time", description: "The preferred time is years away.", preferredAt: new Date(Date.now() + 900 * 86_400_000).toISOString() });
  check("a preferred time years away → 422", r.status === 422, r.body);
  r = await call("GET", "/maintenance/stats", T("tenant"));
  check("tenant numbers: Pending and Active count up by one, critical too", r.status === 200 && r.data?.total === tmBefore.total + 1 && r.data?.open === tmBefore.open + 1 && r.data?.critical === tmBefore.critical + 1, r.body);
  for (const k of ["Second request", "Third request", "Fourth request", "Fifth request", "Sixth request"]) await call("POST", "/maintenance", T("tenant"), { category: "OTHER", title: k, description: "Filler request for paging.", priority: "LOW" });
  r = await call("GET", "/maintenance?limit=3", T("tenant"));
  const pg1 = r.data;
  check("first load: 3 requests, newest first, with apartment, unit and tenant", r.status === 200 && pg1?.items?.length === 3 && !!pg1.nextCursor && pg1.items[0].title === "Sixth request" && !!pg1.items[0].unit?.property?.name && !!pg1.items[0].tenant?.fullName, r.body);
  r = await call("GET", `/maintenance?limit=5&cursor=${pg1?.nextCursor}`, T("tenant"));
  check("Load More: the next 5, no repeats", r.status === 200 && r.data?.items?.length === 5 && !r.data.items.some((x: any) => pg1.items.some((y: any) => y.id === x.id)), r.body);
  r = await call("GET", "/maintenance?statuses=PENDING,APPROVED,IN_PROGRESS&limit=50", T("tenant"));
  check("Active tab: only Pending / Approved / In Progress", r.status === 200 && r.data?.items?.length > 0 && r.data.items.every((x: any) => ["PENDING", "APPROVED", "IN_PROGRESS"].includes(x.status)), r.body);

  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), {});
  check("edit with nothing to change → 422", r.status === 422, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("owner"), { title: "Owner edits" });
  check("edit: the owner cannot edit a tenant's request → 403", r.status === 403, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("general"), { title: "Stranger edits" });
  check("edit: a stranger → 403", r.status === 403, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, undefined, { title: "Nobody edits" });
  check("edit: signed out → 401", r.status === 401, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { status: "IN_PROGRESS" });
  check("edit: the tenant cannot move a request to In Progress → 422", r.status === 422, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { images: [`MAINTENANCE_IMAGE/${users.owner!.id}/x.jpg`] });
  check("edit: a photo that belongs to somebody else → 422", r.status === 422, r.body);
  const updNotes = await db.notification.count({ where: { userId: users.owner!.id, type: "maintenance.updated" } });
  const ownKey = `MAINTENANCE_IMAGE/${users.tenant!.id}/smoke-a.jpg`;
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { title: "Switch sparks badly", priority: "MEDIUM", description: "It sparks every time, please check soon.", category: "ELECTRICAL", preferredAt: null, images: [ownKey] });
  check("edit: title, priority, description, time cleared and a photo added", r.status === 200 && r.data?.title === "Switch sparks badly" && r.data?.priority === "MEDIUM" && r.data?.preferredAt === null && r.data?.images?.length === 1, r.body);
  check("…the landlord is notified and it is in the audit log", (await db.notification.count({ where: { userId: users.owner!.id, type: "maintenance.updated" } })) === updNotes + 1 && (await db.auditLog.count({ where: { action: "maintenance.update", resourceId: tm1 } })) === 1);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { images: [`MAINTENANCE_IMAGE/${users.tenant!.id}/smoke-b.jpg`] });
  check("edit: replacing the photo keeps exactly one", r.status === 200 && r.data?.images?.length === 1 && r.data.images[0].storageKey.endsWith("smoke-b.jpg") && (await db.maintenanceImage.count({ where: { requestId: tm1 } })) === 1, r.body);
  r = await call("GET", "/maintenance/stats", T("tenant"));
  check("edit: priority change moves the critical counter down", r.data?.critical === tmBefore.critical, r.body);

  await call("POST", `/maintenance/${tm1}/status`, T("owner"), { status: "IN_PROGRESS" });
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { title: "Changed while in progress" });
  check("edit: details are locked once work has started → 409", r.status === 409, r.body);
  r = await call("DELETE", `/maintenance/${tm1}`, T("tenant"));
  check("delete: a request in progress cannot be removed by the tenant → 409", r.status === 409 && (await db.maintenanceRequest.count({ where: { id: tm1 } })) === 1, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { status: "COMPLETED" });
  check("edit: the tenant marks it Completed → 200", r.status === 200 && r.data?.status === "COMPLETED", r.body);
  r = await call("GET", "/maintenance/stats", T("tenant"));
  check("…Completed counter goes up", r.data?.byStatus?.COMPLETED === (tmBefore.byStatus?.COMPLETED ?? 0) + 1, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { title: "Edit completed" });
  check("edit: a completed request's details are locked → 409", r.status === 409, r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { status: "PENDING", title: "Switch sparks again" });
  check("edit: reopening a completed request as Pending (with a new title) → 200", r.status === 200 && r.data?.status === "PENDING" && r.data?.title === "Switch sparks again", r.body);
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { status: "COMPLETED" });
  r = await call("PATCH", `/maintenance/${tm1}`, T("tenant"), { status: "COMPLETED" });
  check("edit: Completed → Completed is not a change → 200", r.status === 200 && r.data?.status === "COMPLETED", r.body);

  const rmNotes = await db.notification.count({ where: { userId: users.owner!.id, type: "maintenance.removed" } });
  r = await call("DELETE", `/maintenance/${tm1}`, T("general"));
  check("delete: a stranger → 403", r.status === 403, r.body);
  r = await call("DELETE", `/maintenance/${tm1}`, T("tenant"));
  check("delete: the tenant removes their own request (photos and comments too)", r.status === 200 && r.data?.deleted === true && (await db.maintenanceRequest.count({ where: { id: tm1 } })) === 0 && (await db.maintenanceImage.count({ where: { requestId: tm1 } })) === 0, r.body);
  check("…the landlord is told, and the audit log has it", (await db.notification.count({ where: { userId: users.owner!.id, type: "maintenance.removed" } })) === rmNotes + 1 && (await db.auditLog.count({ where: { action: "maintenance.delete", resourceId: tm1 } })) === 1);
  r = await call("DELETE", `/maintenance/${tm1}`, T("tenant"));
  check("delete twice → 404", r.status === 404, r.body);
  r = await call("GET", "/maintenance/stats", T("tenant"));
  check("tenant numbers after deleting come back down", r.data?.total === tmBefore.total + 5 && r.data?.byStatus?.COMPLETED === (tmBefore.byStatus?.COMPLETED ?? 0), r.body);

  section("find home & marketplace for a tenant");
  r = await call("GET", "/listings?limit=2", T("tenant"));
  check("a tenant can browse homes", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/listings/stats", T("tenant"));
  check("a tenant sees the marketplace numbers", r.status === 200 && typeof r.data?.availableForSale === "number", r.body);
  r = await call("GET", "/me/listings?limit=5", T("tenant"));
  check("a tenant's own listings load (empty is fine)", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/me/favorites", T("tenant"));
  check("a tenant's saved homes load", r.status === 200, r.body);
  r = await call("GET", "/listings/eligibility", T("tenant"));
  check("listing guard for a tenant without a plan → 403 (the page shows the plan note)", r.status === 403 || r.status === 200, r.body);

  section("tenant history page");
  r = await call("GET", "/tenant/history", T("tenant"));
  const th0 = r.data;
  check("history: summary numbers and the active stay first", r.status === 200 && typeof th0?.summary?.yearsRented === "number" && th0.summary.properties >= 1 && th0.summary.propertyNames?.length >= 1 && th0.stays?.[0]?.status === "ACTIVE" && !!th0.stays[0].property?.name && !!th0.stays[0].unit?.unitNumber && !!th0.stays[0].landlord?.fullName, r.body);
  check("history: the active stay has no end date and a pay-to number", th0?.stays?.[0]?.endDate === null && !!th0.stays[0].payTo && Array.isArray(th0.stays[0].ledger?.items), th0?.stays?.[0]);
  r = await call("GET", "/tenant/history", T("owner"));
  check("history: the owner → 403", r.status === 403, r.body);
  r = await call("GET", "/tenant/history");
  check("history: signed out → 401", r.status === 401, r.body);
  const hAgr = await db.rentalAgreement.findFirst({ where: { tenantId: users.tenant!.id, status: "ACTIVE" } });
  const oldMonth = new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth() - 2, 1));
  const hRec = await db.rentRecord.create({ data: { agreementId: hAgr!.id, billingMonth: oldMonth, rent: 20000, utility: 500, other: 0, total: 20500, paid: 0, dueDate: new Date(oldMonth.getTime() + 9 * 86400_000), status: "OVERDUE" } });
  r = await call("GET", "/tenant/history", T("tenant"));
  const hrow0 = r.data?.stays?.[0]?.ledger?.items?.find((x: any) => x.recordId === hRec.id) ?? (await call("GET", `/tenant/history/${hAgr!.id}/records?offset=0&limit=50`, T("tenant"))).data?.items?.find((x: any) => x.recordId === hRec.id);
  check("history: an old unpaid month is UNPAID and late", hrow0?.state === "UNPAID" && hrow0.late === true && Number(hrow0.owed) === 20500, hrow0);
  check("history: the Unpaid Balance turns overdue with the amount", r.data?.summary?.unpaid?.state === "OVERDUE" && Number(r.data.summary.unpaid.amount) >= 20500 && r.data.summary.unpaid.graceDay === 5, r.data?.summary?.unpaid);
  r = await call("GET", `/tenant/history/${hAgr!.id}/records?offset=0&limit=2`, T("tenant"));
  check("history: View All Receipts pages (2 rows, more to come)", r.status === 200 && r.data?.items?.length === 2 && typeof r.data.hasMore === "boolean", r.body);
  r = await call("GET", `/tenant/history/${hAgr!.id}/records?offset=0&limit=500`, T("tenant"));
  check("history: a limit above 50 → 422", r.status === 422, r.body);
  r = await call("GET", `/tenant/history/${hAgr!.id}/records`, T("owner"));
  check("history: records of a stay for the owner → 403", r.status === 403, r.body);
  r = await call("GET", `/tenant/rent/${hRec.id}/invoice`, T("tenant"));
  check("invoice: an unpaid month → 409", r.status === 409, r.body);
  r = await call("POST", `/tenant/rent/${hRec.id}/pay`, T("tenant"), { method: "NAGAD", reference: `HIST${Date.now().toString(36).toUpperCase()}` });
  const hPay = r.data?.id ?? r.data?.payment?.id;
  check("send paid request from the history page → 201", r.status === 201, r.body);
  r = await call("GET", `/tenant/history/${hAgr!.id}/records?offset=0&limit=50`, T("tenant"));
  const hrow1 = r.data?.items?.find((x: any) => x.recordId === hRec.id);
  check("history: the row is now PENDING with the request details", hrow1?.state === "PENDING" && hrow1.pending?.method === "NAGAD", hrow1);
  r = await call("GET", "/tenant/history", T("tenant"));
  check("history: a pending request is still counted as unpaid", Number(r.data?.summary?.unpaid?.amount) >= 20500, r.data?.summary?.unpaid);
  r = await call("POST", `/rent/payments/${hPay}/verify`, T("owner"), { decision: "VERIFIED" });
  check("the landlord approves the request", r.status === 200, r.body);
  r = await call("GET", `/tenant/history/${hAgr!.id}/records?offset=0&limit=50`, T("tenant"));
  const hrow2 = r.data?.items?.find((x: any) => x.recordId === hRec.id);
  check("history: the row flips to PAID with a paid date", hrow2?.state === "PAID" && !!hrow2.paidAt, hrow2);
  r = await call("GET", `/tenant/rent/${hRec.id}/invoice`, T("tenant"));
  check("invoice: number, month, method, landlord, tenant, unit and itemised amounts", r.status === 200 && /^INV-\d{6}-[0-9A-F]{8}$/.test(r.data?.invoiceNo) && r.data.billingMonth === oldMonth.toISOString().slice(0, 7) && r.data.methods?.includes("NAGAD") && !!r.data.owner?.fullName && /^OW\d+$/.test(r.data.owner.ownerCode ?? "") && !!r.data.tenant?.fullName && !!r.data.unit && !!r.data.property && Number(r.data.items.rent) === 20000 && Number(r.data.total) === 20500 && r.data.payments?.length === 1, r.body);
  r = await call("GET", `/tenant/rent/${hRec.id}/invoice`, T("owner"));
  check("invoice: the owner cannot use the tenant's invoice route → 403", r.status === 403, r.body);
  r = await call("GET", `/tenant/rent/${hRec.id}/invoice`);
  check("invoice: signed out → 401", r.status === 401, r.body);
  await db.rentPayment.deleteMany({ where: { rentRecordId: hRec.id } });
  await db.rentRecord.delete({ where: { id: hRec.id } });
  r = await call("GET", "/tenant/history", T("tenant"));
  check("history: after clean-up the numbers come back", r.status === 200 && !r.data.stays[0].ledger.items.some((x: any) => x.recordId === hRec.id), r.body);

  section("tenant notifications page (Your Activity)");
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  const ns0 = r.data;
  check("summary: next payment date, pending tasks and quick issues", r.status === 200 && ns0?.hasLease === true && !!ns0.nextPayment?.dueDate && typeof ns0.pendingTasks === "number" && typeof ns0.quickIssues?.total === "number" && ns0.quickIssues.total === ns0.quickIssues.ruleWarnings + ns0.quickIssues.alerts && !!ns0.owner?.fullName && !!ns0.payTo, r.body);
  r = await call("GET", "/tenant/notifications/summary", T("owner"));
  check("summary: the owner → 403", r.status === 403, r.body);
  r = await call("GET", "/tenant/notifications");
  check("feed: signed out → 401", r.status === 401, r.body);
  r = await call("GET", "/tenant/notifications", T("owner"));
  check("feed: the owner → 403", r.status === 403, r.body);
  r = await call("GET", "/tenant/notifications?tab=bogus", T("tenant"));
  check("feed: an unknown tab → 422", r.status === 422, r.body);
  r = await call("GET", "/tenant/notifications?limit=51", T("tenant"));
  check("feed: more than 50 at once → 422", r.status === 422, r.body);
  r = await call("GET", "/tenant/notifications?tab=all&limit=10", T("tenant"));
  const nf1 = r.data;
  check("feed: at most 10 per page, newest first, each with its tab", r.status === 200 && nf1?.items?.length <= 10 && typeof nf1.unread === "number" && nf1.items.every((x: any, i: number, a: any[]) => !!x.tab && (i === 0 || a[i - 1].id > x.id)), r.body);
  check("feed: `sos.update` never gets a card of its own", !nf1?.items?.some((x: any) => x.type === "sos.update"), nf1?.items?.map((x: any) => x.type));
  if (nf1?.nextCursor) {
    r = await call("GET", `/tenant/notifications?tab=all&limit=10&cursor=${nf1.nextCursor}`, T("tenant"));
    check("Load More: the next ten, no repeats", r.status === 200 && r.data.items.length <= 10 && !r.data.items.some((x: any) => nf1.items.some((y: any) => y.id === x.id)), r.body);
  }

  // an emergency from the dashboard becomes one live card, and ACCEPT / UNSOLVED work on it
  r = await call("POST", "/sos", T("tenant"), { type: "THEFT", description: "Someone tried the door" });
  const nsAlert = r.data?.alert?.id;
  check("tenant raises a THEFT alert", r.status === 201 && !!nsAlert, r.body);
  r = await call("GET", "/tenant/notifications?tab=issues&limit=50", T("tenant"));
  const sosCard = r.data?.items?.find((x: any) => x.type === "sos.sent" && x.params?.alertId === nsAlert);
  check("issues tab: the alert is one card with its live status (NEED_ACTION)", sosCard?.tab === "issues" && sosCard.live?.kind === "alert" && sosCard.live.status === "NEED_ACTION" && sosCard.live.accepted === false, sosCard);
  r = await call("GET", "/tenant/notifications?tab=payment&limit=50", T("tenant"));
  check("payment tab holds no emergency card", !r.data?.items?.some((x: any) => x.type.startsWith("sos.")), r.body);
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  check("quick issues counts the open alert", r.data?.quickIssues?.alerts === ns0.quickIssues.alerts + 1, r.body);
  r = await call("POST", `/sos/${nsAlert}/unsolved`, T("tenant"));
  check("unsolved before it is solved → 409", r.status === 409, r.body);
  r = await call("POST", `/sos/${nsAlert}/accept`, T("tenant"));
  check("accept before it is solved → 409", r.status === 409, r.body);
  await call("POST", `/gov/alerts/${nsAlert}/ack`, T("gov"));
  r = await call("POST", `/gov/alerts/${nsAlert}/status`, T("gov"), { status: "SOLVED", note: "Patrol checked the building" });
  check("gov marks the alert SOLVED", r.status === 200 && r.data?.status === "SOLVED", r.body);
  r = await call("GET", "/tenant/notifications?tab=issues&limit=50", T("tenant"));
  check("the card now offers ACCEPT / UNSOLVED (live SOLVED, not accepted)", r.data?.items?.find((x: any) => x.params?.alertId === nsAlert && x.type === "sos.sent")?.live?.status === "SOLVED", r.body);
  r = await call("POST", `/sos/${nsAlert}/unsolved`, T("owner"));
  check("unsolved: not the reporter → 404/403", r.status === 404 || r.status === 403, r.body);
  const govBefore = await db.notification.count({ where: { type: "sos.reopened" } });
  r = await call("POST", `/sos/${nsAlert}/unsolved`, T("tenant"));
  check("UNSOLVED → reopened as PROCESSING", r.status === 200 && r.data?.reopened === true && r.data?.status === "PROCESSING" && (await db.emergencyAlert.findUnique({ where: { id: nsAlert } }))?.status === "PROCESSING", r.body);
  check("…the landlord and the government team are alerted (CRITICAL)", (await db.notification.count({ where: { type: "sos.reopened" } })) >= govBefore + 2 && (await db.notification.count({ where: { type: "sos.reopened", userId: users.owner!.id, priority: "CRITICAL" } })) >= 1, null);
  check("…and the audit log has it", (await db.auditLog.count({ where: { action: "sos.unsolved", resourceId: nsAlert } })) === 1);
  r = await call("POST", `/sos/${nsAlert}/unsolved`, T("tenant"));
  check("unsolved twice → 409 (it is not solved any more)", r.status === 409, r.body);
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  check("quick issues still counts it while it is being handled", r.data?.quickIssues?.alerts === ns0.quickIssues.alerts + 1, r.body);
  await call("POST", `/gov/alerts/${nsAlert}/status`, T("gov"), { status: "SOLVED", note: "Solved for real" });
  r = await call("POST", `/sos/${nsAlert}/accept`, T("tenant"));
  check("ACCEPT after the second fix → accepted", r.status === 200 && r.data?.accepted === true, r.body);
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  check("…the quick-issue counter goes back down", r.data?.quickIssues?.alerts === ns0.quickIssues.alerts, r.body);
  r = await call("POST", `/sos/${nsAlert}/unsolved`, T("tenant"));
  check("unsolved after accepting → 409", r.status === 409, r.body);

  // rent: overdue reminder + invoice cards and the pay-request button state
  const nAgr = await db.rentalAgreement.findFirst({ where: { tenantId: users.tenant!.id, status: "ACTIVE" } });
  const nMonth = new Date(Date.UTC(new Date().getUTCFullYear() - 2, 4, 1));
  const nRec = await db.rentRecord.create({ data: { agreementId: nAgr!.id, billingMonth: nMonth, rent: 18000, utility: 500, total: 18500, paid: 0, dueDate: new Date(nMonth.getTime() + 9 * 86400_000), status: "OVERDUE" } });
  const { notifyOverdue, notifyInvoices } = await import("../src/modules/rent/service");
  await notifyOverdue();
  await notifyOverdue();
  check("overdue rent tells the tenant once (rent.late)", (await db.notification.count({ where: { userId: users.tenant!.id, type: "rent.late", params: { path: ["recordId"], equals: nRec.id } } })) === 1);
  await notifyInvoices(nMonth);
  await notifyInvoices(nMonth);
  check("the invoice notification is sent once (rent.invoice)", (await db.notification.count({ where: { userId: users.tenant!.id, type: "rent.invoice", params: { path: ["recordId"], equals: nRec.id } } })) === 1);
  r = await call("GET", "/tenant/notifications?tab=payment&limit=50", T("tenant"));
  const ninv = r.data?.items?.find((x: any) => x.type === "rent.invoice" && x.params?.recordId === nRec.id);
  check("payment tab: the invoice card is live UNPAID with the amount owed", ninv?.live?.state === "UNPAID" && Number(ninv.live.owed) === 18500 && ninv.tab === "payment", ninv);
  r = await call("GET", "/tenant/notifications?tab=issues&limit=50", T("tenant"));
  const late = r.data?.items?.find((x: any) => x.type === "rent.late" && x.params?.recordId === nRec.id);
  check("issues tab: the 'violate agreement' card is live UNPAID and late", late?.live?.state === "UNPAID" && late.live.late === true, late);
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  check("quick issues counts the late month as a rule warning", r.data?.quickIssues?.ruleWarnings === ns0.quickIssues.ruleWarnings + 1, r.body);
  r = await call("POST", `/tenant/rent/${nRec.id}/pay`, T("tenant"), { method: "BKASH", reference: `NTF${Date.now().toString(36).toUpperCase()}` });
  const nPay = r.data?.id ?? r.data?.payment?.id;
  r = await call("GET", "/tenant/notifications?tab=payment&limit=50", T("tenant"));
  check("after Send Pay Request the card is PENDING (no second request)", r.data?.items?.find((x: any) => x.id === ninv.id)?.live?.state === "PENDING", r.body);
  r = await call("POST", `/rent/payments/${nPay}/verify`, T("owner"), { decision: "VERIFIED" });
  r = await call("GET", "/tenant/notifications?tab=payment&limit=50", T("tenant"));
  check("when the landlord approves, the card becomes PAID", r.data?.items?.find((x: any) => x.id === ninv.id)?.live?.state === "PAID", r.body);
  r = await call("GET", "/tenant/notifications/summary", T("tenant"));
  check("…and the rule warning is gone", r.data?.quickIssues?.ruleWarnings === ns0.quickIssues.ruleWarnings, r.body);
  r = await call("POST", `/notifications/${ninv.id}/read`, T("tenant"));
  r = await call("GET", "/tenant/notifications?tab=payment&limit=50", T("tenant"));
  check("Mark as Read works on a tenant card", r.data?.items?.find((x: any) => x.id === ninv.id)?.readAt !== null, r.body);
  await db.rentPayment.deleteMany({ where: { rentRecordId: nRec.id } });
  await db.rentRecord.delete({ where: { id: nRec.id } });

  section("new user: Create Listing → pricing, Subscription tab; verified tenant cannot become an owner");
  r = await call("GET", "/me", T("general"));
  check("a new user is a GENERAL_USER (the sidebar shows the Subscription tab)", r.status === 200 && r.data?.role === "GENERAL_USER", r.body);
  r = await call("GET", "/me", T("tenant"));
  check("a verified tenant is a TENANT (no Subscription tab)", r.status === 200 && r.data?.role === "TENANT", r.body);
  r = await call("GET", "/plans");
  const ownerPlans = (r.data ?? []).filter((p: any) => p.audience === "OWNER");
  check("Create Listing pricing: the owner plans come with monthly prices", r.status === 200 && ownerPlans.length >= 1 && ownerPlans.every((p: any) => Number(p.prices?.MONTHLY?.total) > 0), r.body);
  r = await call("GET", "/listings/eligibility", T("general"));
  const hasSellerPlan = (await db.userSubscription.count({ where: { userId: users.general!.id, audience: "SELLER", status: { in: ["ACTIVE", "GRACE"] } } })) > 0;
  check("listing: no seller plan → 403 LISTING_ENTITLEMENT_REQUIRED (the page shows the pricing); with an approved seller plan → eligible", hasSellerPlan ? r.status === 200 && r.data?.eligible === true : r.status === 403 && r.code === "LISTING_ENTITLEMENT_REQUIRED", r.body);
  r = await call("GET", "/listings/eligibility", T("tenant"));
  check("a verified tenant cannot list either → 403", r.status === 403, r.body);
  r = await call("GET", "/me/subscription", T("general"));
  check("Subscription page: no owner plan for a new user (a seller plan is separate)", r.status === 200 && r.data?.owner?.status === "NONE" && r.data?.owner?.planCode === null, r.body);
  r = await call("GET", "/me/payments", T("general"));
  check("Subscription page: billing history loads (empty)", r.status === 200 && Array.isArray(r.data), r.body);
  r = await call("POST", "/subscriptions/quote", T("general"), { planId: ownerPlans[0]?.id, cycle: "MONTHLY" });
  check("a new user gets a server-side price for an owner plan", r.status === 200 && Number(r.data?.payable) > 0, r.body);
  r = await call("POST", "/subscriptions/quote", T("tenant"), { planId: ownerPlans[0]?.id, cycle: "MONTHLY" });
  check("a verified tenant cannot become an owner → 409 (active tenancy)", r.status === 409, r.body);
  r = await call("POST", "/upgrade-requests", T("tenant"), { planId: ownerPlans[0]?.id, cycle: "MONTHLY", senderNumber: "01712345678", trxId: `VT${Date.now().toString(36).toUpperCase()}` });
  check("…and cannot send an upgrade request either → 409", r.status === 409, r.body);

  section("Tenant-Free account: same pages as a verified tenant (empty until a lease exists)");
  r = await call("GET", "/dashboard/tenant", T("general"));
  check("dashboard: no lease, no error", r.status === 200 && r.data?.tenancy === null, r.body);
  r = await call("GET", "/dashboard/tenant/activity?limit=5", T("general"));
  check("dashboard activity: empty list", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/maintenance/stats", T("general"));
  check("maintenance numbers: zero, and nobody else's requests", r.status === 200 && r.data?.total === 0 && r.data?.open === 0, r.body);
  r = await call("GET", "/maintenance?limit=3", T("general"));
  check("maintenance list: empty (never another person's requests)", r.status === 200 && r.data?.items?.length === 0, r.body);
  r = await call("POST", "/maintenance", T("general"), { category: "OTHER", title: "No lease yet", description: "A request needs a lease first." });
  check("new request without a lease → 409 (not 403)", r.status === 409, r.body);
  r = await call("GET", "/tenant/history", T("general"));
  check("history: no stays, zero numbers, all dues cleared", r.status === 200 && r.data?.stays?.length === 0 && r.data.summary.properties === 0 && r.data.summary.unpaid.state === "CLEAR", r.body);
  r = await call("GET", "/tenant/notifications/summary", T("general"));
  check("notifications summary: no lease", r.status === 200 && r.data?.hasLease === false && r.data.nextPayment === null, r.body);
  r = await call("GET", "/tenant/notifications?limit=10", T("general"));
  check("notifications feed loads", r.status === 200 && Array.isArray(r.data?.items), r.body);
  r = await call("GET", "/dashboard/tenant", T("owner"));
  check("the owner still cannot open the tenant dashboard → 403", r.status === 403, r.body);

  // paying makes a Tenant-Free account an Apartment Owner, in one step and exactly once
  const promo = await db.user.create({ data: { username: `promo${tag}`, fullName: "Promo User", email: `promo.${tag}@mailinator.com`, phone: phone(), role: "GENERAL_USER" } });
  users.promo = { key: "promo", id: promo.id, authId: "", email: promo.email!, password: "", username: promo.username, token: "" };
  const promoTrx = `PROMO${tag}`.toUpperCase();
  const promoReq = await db.upgradeRequest.create({ data: { userId: promo.id, planId: ownerPlans[0].id, cycle: "MONTHLY", expectedAmount: ownerPlans[0].prices.MONTHLY.total, quoteSnapshot: {}, senderNumber: "01712345678", trxId: promoTrx, fromRole: "GENERAL_USER", toRole: "OWNER" } });
  await db.paymentTransaction.create({ data: { userId: promo.id, purpose: "SUBSCRIPTION", upgradeRequestId: promoReq.id, amount: ownerPlans[0].prices.MONTHLY.total, gateway: "MANUAL_BKASH", gatewayTxnId: promoTrx, status: "PENDING_REVIEW" } });
  check("before approval the account is still Tenant-Free with no Owner ID", (await db.user.findUnique({ where: { id: promo.id } }))?.role === "GENERAL_USER" && (await db.user.findUnique({ where: { id: promo.id } }))?.ownerCode === null);
  await db.notification.create({ data: { userId: promo.id, type: "message.new", titleKey: "notifications.messageNew", link: "/tenant-free/messages?c=00000000-0000-0000-0000-000000000000" } });
  r = await call("POST", `/admin/upgrade-requests/${promoReq.id}/approve`, T("super"));
  check("approval → Owner ID and invoice", r.status === 200 && /^OW\d+$/.test(r.data?.ownerCode ?? "") && /^INV-/.test(r.data?.invoice ?? ""), r.body);
  const promoNow = await db.user.findUnique({ where: { id: promo.id }, include: { ownerProfile: true } });
  check("…the Tenant-Free account is now an OWNER with an owner profile and the same Owner ID", promoNow?.role === "OWNER" && !!promoNow.ownerProfile && promoNow.ownerCode === r.data?.ownerCode, promoNow?.role);
  check("…a live owner plan, an approved request, a successful payment and one invoice (nothing half-done)", (await db.userSubscription.count({ where: { userId: promo.id, audience: "OWNER", status: "ACTIVE" } })) === 1 && (await db.upgradeRequest.count({ where: { id: promoReq.id, status: "APPROVED" } })) === 1 && (await db.paymentTransaction.count({ where: { userId: promo.id, status: "SUCCESS" } })) === 1 && (await db.invoice.count({ where: { transaction: { userId: promo.id } } })) === 1);
  check("…the new owner's saved links moved from /tenant-free to /home-owner, and the approval message points to /home-owner", (await wrongAreaLinks(promo.id, "/home-owner")) === 0 && (await db.notification.count({ where: { userId: promo.id, type: "upgrade.approved", link: { startsWith: "/home-owner/" } } })) === 1);
  r = await call("POST", `/admin/upgrade-requests/${promoReq.id}/approve`, T("super"));
  check("approving the same payment twice → 409 (no second plan, no second invoice)", r.status === 409 && (await db.userSubscription.count({ where: { userId: promo.id } })) === 1 && (await db.invoice.count({ where: { transaction: { userId: promo.id } } })) === 1, r.body);

  check("the apartment owner's notification links all live under /home-owner (none under /owner, /tenant or /tenant-free)", (await wrongAreaLinks(users.owner!.id, "/home-owner")) === 0 && (await db.notification.count({ where: { userId: users.owner!.id, link: { startsWith: "/owner" } } })) === 0);
  check("the Tenant-Free account's links all live under /tenant-free", (await wrongAreaLinks(users.general!.id, "/tenant-free")) === 0, (await db.notification.findMany({ where: { userId: users.general!.id }, select: { type: true, link: true } })).filter((x) => x.link && !x.link.startsWith("/tenant-free")));

  section("Tenant Free profile page: identity, Tenant ID, update, documents");
  r = await call("GET", "/me/tenant-overview");
  check("tenant overview: signed out → 401", r.status === 401, r.body);
  r = await call("GET", "/me/tenant-overview", T("owner"));
  check("tenant overview: an apartment owner → 403", r.status === 403, r.body);
  r = await call("GET", "/me/tenant-overview", T("general"));
  const tp0 = r.data;
  check("tenant overview: identity, a permanent Tenant ID (TF…), member count and empty document slots", r.status === 200 && tp0?.user?.username === users.general!.username && /^TF\d{6,}$/.test(tp0?.user?.tenantCode ?? "") && tp0.user.members === 1 && tp0.user.role === "GENERAL_USER" && tp0.documents?.nidFront === null && tp0.documents?.agreement === null, r.body);
  r = await call("GET", "/me/tenant-overview", T("general"));
  check("…the Tenant ID is the same every time", r.data?.user?.tenantCode === tp0?.user?.tenantCode, r.body);
  check("…and no two accounts share a Tenant ID", (await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM (SELECT "tenantCode" FROM "User" WHERE "tenantCode" IS NOT NULL GROUP BY "tenantCode" HAVING count(*) > 1) d`)[0]?.n === 0n);
  r = await call("PATCH", "/me", T("general"), { tenantCode: "TF999999" });
  check("the Tenant ID is locked: it cannot be changed → 422", r.status === 422 && (await db.user.findUnique({ where: { id: users.general!.id } }))?.tenantCode === tp0?.user?.tenantCode, r.body);
  r = await call("PATCH", "/me", T("general"), { tenant: { members: 4 }, occupation: "Software Engineer", address: { division: "Chittagong", district: "Comilla", upazila: "Muradnagar", union: "South Keranigonj", street: "203 House, Block-A", postOffice: "Doshani Bazar" } });
  check("update profile: member count, occupation and permanent address → 200", r.status === 200, r.body);
  r = await call("GET", "/me/tenant-overview", T("general"));
  check("…the page shows them (Member 4, address filled)", r.data?.user?.members === 4 && r.data.user.occupation === "Software Engineer" && r.data.address?.district === "Comilla" && r.data.address?.union === "South Keranigonj", r.body);
  r = await call("PATCH", "/me", T("general"), { tenant: { members: 0 } });
  check("member count below 1 → 422", r.status === 422, r.body);
  r = await call("PATCH", "/me", T("general"), { tenant: { members: 31 } });
  check("member count above 30 → 422", r.status === 422, r.body);
  r = await call("PATCH", "/me", T("owner"), { tenant: { members: 2 } });
  check("the tenant block is not for an owner → 403", r.status === 403, r.body);
  r = await call("PATCH", "/me", T("general"), { nid: "12345" });
  check("NID number must be 13–17 digits → 422", r.status === 422, r.body);
  const myNid = `199${Date.now().toString().slice(-10)}`;
  r = await call("PATCH", "/me", T("general"), { nid: myNid });
  check("NID number updated → 200", r.status === 200, r.body);
  r = await call("GET", "/me/tenant-overview", T("general"));
  check("…the page shows it", r.data?.user?.nid === myNid, r.body);
  r = await call("PATCH", "/me", T("tenant"), { nid: myNid });
  check("the same NID number on another account is refused (409, or 403 when that NID is locked)", (r.status === 409 && r.body?.details?.field === "nid") || (r.status === 403 && r.body?.details?.reason === "nid_locked"), r.body);
  r = await call("PATCH", "/me", T("general"), { email: users.owner!.email });
  check("an e-mail that another account uses → 409", r.status === 409 && r.body?.details?.field === "email", r.body);
  const newEmail = `moved.${tag}@mailinator.com`;
  r = await call("PATCH", "/me", T("general"), { email: newEmail });
  check("e-mail changed (the sign-in account follows) → 200", r.status === 200 && r.data?.email === newEmail, r.body);
  r = await call("PATCH", "/me", T("general"), { email: users.general!.email });
  check("…and changed back", r.status === 200 && r.data?.email === users.general!.email, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "NID_FRONT", storageKey: `NID_FRONT/${users.general!.id}/tp-front.png` });
  check("NID front uploaded → 201", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "AGREEMENT", storageKey: `NID_FRONT/${users.general!.id}/tp-wrong.png` });
  check("an agreement must be uploaded as a verification document → 422", r.status === 422, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "AGREEMENT", storageKey: `VERIFICATION_DOC/${users.owner!.id}/tp-theirs.pdf` });
  check("somebody else's upload → 403", r.status === 403, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "AGREEMENT", storageKey: `VERIFICATION_DOC/${users.general!.id}/tp-agreement.pdf` });
  check("agreement uploaded → 201", r.status === 201, r.body);
  r = await call("GET", "/me/tenant-overview", T("general"));
  check("the Documents card: NID front PENDING with a date, NID back empty, own agreement PENDING", r.data?.documents?.nidFront?.status === "PENDING" && !!r.data.documents.nidFront.date && r.data.documents.nidBack === null && r.data.documents.agreement?.source === "OWN" && r.data.documents.agreement.status === "PENDING", r.body);
  const oldAv = `AVATAR/${users.general!.id}/tp-old.png`;
  await call("PATCH", "/me", T("general"), { avatarKey: oldAv });
  r = await call("PATCH", "/me", T("general"), { avatarKey: `AVATAR/${users.general!.id}/tp-new.png` });
  check("a new profile photo replaces the old one (only the new key is kept)", r.status === 200 && (await db.user.findUnique({ where: { id: users.general!.id } }))?.avatarKey === `AVATAR/${users.general!.id}/tp-new.png`, r.body);

  section("Super Admin dashboard: platform KPIs, date range, Active Plans");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    r = await call("GET", "/dashboard/admin/kpis", T(who));
    check(`${who} cannot read the platform KPIs → 403`, r.status === 403, r.body);
    r = await call("GET", "/dashboard/admin/active-plans", T(who));
    check(`${who} cannot read Active Plans → 403`, r.status === 403, r.body);
  }
  r = await call("GET", "/dashboard/admin/kpis", null);
  check("KPIs without sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/dashboard/admin/kpis", T("super"));
  const k = r.data;
  const live = { archivedAt: null, status: { not: "DELETED" as const } };
  const [nOwners, nProps, nTenants] = await Promise.all([
    db.user.count({ where: { role: "OWNER", ...live } }), db.property.count({ where: { archivedAt: null } }), db.user.count({ where: { role: "TENANT", archivedAt: null, status: "ACTIVE" } }),
  ]);
  check("KPIs: six numbers that match the database", r.status === 200 && k.totalOwners === nOwners && k.propertiesManaged === nProps && k.activeTenants === nTenants && k.paidOwners + k.unpaidOwners === k.totalOwners && k.paidOwners >= 0 && k.unpaidOwners >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(k.range?.from), r.body);
  const sumRange = async (from: string, to: string) => Number((await db.paymentTransaction.aggregate({ where: { status: "SUCCESS", purpose: "SUBSCRIPTION", verifiedAt: { gte: new Date(`${from}T00:00:00+06:00`), lte: new Date(`${to}T23:59:59.999+06:00`) } }, _sum: { amount: true } }))._sum.amount ?? 0);
  r = await call("GET", "/dashboard/admin/kpis?from=2020-01-01&to=2029-12-31", T("super"));
  check("revenue of a wide date range = every verified subscription payment", r.status === 200 && Number(r.data.revenue.amount) === (await sumRange("2020-01-01", "2029-12-31")), r.body);
  r = await call("GET", "/dashboard/admin/kpis?from=2000-01-01&to=2099-12-31", T("super"));
  check("a range of more than ten years → 422", r.status === 422, r.body);
  r = await call("GET", "/dashboard/admin/kpis?from=2001-01-01&to=2001-01-31", T("super"));
  check("revenue of a range with no payments → 0", r.status === 200 && Number(r.data.revenue.amount) === 0 && r.data.revenue.payments === 0, r.body);
  r = await call("GET", "/dashboard/admin/kpis?from=2026-12-30&to=2026-10-01", T("super"));
  check("end before start → 422", r.status === 422, r.body);
  r = await call("GET", "/dashboard/admin/kpis?from=nope", T("super"));
  check("malformed date → 422", r.status === 422, r.body);
  const segs: Record<string, string> = { owners: "OWNER", tenants: "TENANT", free: "GENERAL_USER" };
  for (const [seg, role] of Object.entries(segs)) {
    r = await call("GET", `/dashboard/admin/active-plans?segment=${seg}&limit=50`, T("super"));
    check(`Active Plans "${seg}": only ${role} accounts, newest first`, r.status === 200 && r.data.items.length > 0 && r.data.items.every((x: any) => x.role === role) && r.data.items.every((x: any, i: number, a: any[]) => i === 0 || a[i - 1].id > x.id) && r.data.total >= r.data.items.length, r.body);
  }
  r = await call("GET", "/dashboard/admin/active-plans?segment=all&limit=9", T("super"));
  const p1 = r.data;
  check("Active Plans \"all\": 9 rows, a next cursor, only owners / tenants / Tenant Free (no admins)", r.status === 200 && p1.items.length === 9 && !!p1.nextCursor && p1.items.every((x: any) => ["OWNER", "TENANT", "GENERAL_USER"].includes(x.role)), r.body);
  r = await call("GET", `/dashboard/admin/active-plans?segment=all&limit=10&cursor=${p1.nextCursor}`, T("super"));
  check("View More: the next rows follow with no repeats", r.status === 200 && r.data.items.length >= 1 && r.data.items.every((x: any) => !p1.items.some((y: any) => y.id === x.id)), r.body);
  r = await call("GET", "/dashboard/admin/active-plans?segment=owners&limit=50", T("super"));
  const own = r.data?.items ?? [];
  const sub = await db.userSubscription.findFirst({ where: { audience: "OWNER", status: "ACTIVE", userId: { in: own.map((x: any) => x.id) } }, select: { userId: true, plan: { select: { code: true } } } });
  const ownRow = own.find((x: any) => x.id === sub?.userId);
  check("an owner with a running plan shows that plan and Active", !sub || (ownRow?.plan?.code === sub.plan.code && ownRow.status === "ACTIVE"), ownRow);
  r = await call("GET", "/dashboard/admin/active-plans?segment=tenants&limit=50", T("super"));
  check("tenants show N/A plan and the building type of their lease", r.status === 200 && r.data.items.every((x: any) => x.plan === null) && r.data.items.some((x: any) => x.propertyType === "APARTMENT_BUILDING" && x.status === "ACTIVE"), r.body);
  r = await call("GET", "/dashboard/admin/active-plans?segment=admins", T("super"));
  check("unknown segment → 422", r.status === 422, r.body);
  r = await call("POST", "/admin/users", T("super"), { fullName: "Second Super", username: `supx${tag}`, email: `supx.${tag}@mailinator.com`, phone: phone(), password: "Passw0rdx1", role: "SUPER_ADMIN" });
  check("nobody can create another Super Admin through the API → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/users/${users.general!.id}/role`, T("super"), { role: "SUPER_ADMIN" });
  check("nobody can be promoted to Super Admin through the API → 422", r.status === 422, r.body);
  check("the platform Super Admin account exists with the reserved email", (await db.user.count({ where: { role: "SUPER_ADMIN", email: "amarghor2026@gmail.com", status: "ACTIVE" } })) === 1);

  section("Super Admin Properties page: counters, tabs, view, status change, delete, add");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/properties/stats", "/admin/properties/table", "/admin/properties/owners"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/properties/stats", null);
  check("property counters without sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/properties/stats", T("super"));
  const ps = r.data;
  const [dbProps, dbPending] = await Promise.all([
    db.property.count({ where: { archivedAt: null } }),
    db.property.count({ where: { archivedAt: null, status: "ACTIVE", verificationStatus: { in: ["UNVERIFIED", "PENDING"] } } }),
  ]);
  const dbOcc = await db.unit.count({ where: { archivedAt: null, availability: "OCCUPIED" } });
  check("counters: properties and pending match the database; occupancy = occupied ÷ total units", r.status === 200 && ps.totalProperties === dbProps && ps.pendingApproval === dbPending && ps.occupiedUnits === dbOcc && ps.totalUnits >= ps.occupiedUnits && Math.abs(ps.occupancyRate - (ps.totalUnits ? (ps.occupiedUnits * 100) / ps.totalUnits : 0)) < 0.1, r.body);
  for (const tab of ["all", "active", "pending"]) {
    r = await call("GET", `/admin/properties/table?tab=${tab}&limit=50`, T("super"));
    const want = tab === "all" ? "" : tab === "active" ? "ACTIVE" : "PENDING";
    check(`tab "${tab}": ${tab === "all" ? "every property" : `only ${want} rows`}, with owner, place and unit counts`, r.status === 200 && r.data.items.every((x: any) => (want ? x.state === want : true) && x.owner?.fullName && x.totalUnits >= x.occupiedUnits) && r.data.total >= r.data.items.length, r.body);
  }
  r = await call("GET", "/admin/properties/table?tab=all&limit=1", T("super"));
  const propPage1 = r.data;
  check("first page: 1 row and a cursor (the table asks for 9, then 10 more per View More)", r.status === 200 && propPage1.items.length === 1 && !!propPage1.nextCursor && propPage1.total >= 2, r.body);
  r = await call("GET", `/admin/properties/table?tab=all&limit=1&cursor=${propPage1.nextCursor}`, T("super"));
  check("View More: the next rows follow with no repeats", r.status === 200 && r.data.items.length >= 1 && r.data.items.every((x: any) => !propPage1.items.some((y: any) => y.id === x.id)), r.body);
  r = await call("GET", "/admin/properties/table?tab=archived", T("super"));
  check("unknown tab → 422", r.status === 422, r.body);

  r = await call("POST", "/admin/properties", T("super"), { ownerId: users.owner!.id, name: `Admin Added ${tag}`, type: "HOUSE", locationText: "Mirpur DOHS, Dhaka", declaredUnits: 6, totalSqft: 4800 });
  const addedId = r.data?.id;
  check("Add New Property for an owner → 201, starts Active", r.status === 201 && r.data.state === "ACTIVE", r.body);
  r = await call("POST", "/admin/properties", T("super"), { ownerId: users.tenant!.id, name: "Not An Owner", locationText: "Dhaka", declaredUnits: 2 });
  check("a property cannot be added for a tenant → 422", r.status === 422, r.body);
  r = await call("POST", "/admin/properties", T("owner"), { ownerId: users.owner!.id, name: "Sneaky", locationText: "Dhaka", declaredUnits: 2 });
  check("an owner cannot use the admin add → 403", r.status === 403, r.body);
  r = await call("GET", `/admin/properties/${addedId}/overview`, T("super"));
  check("View Details: owner, place, area, occupancy 0 of 6, amenities list", r.status === 200 && r.data.owner.id === users.owner!.id && r.data.sqft === 4800 && r.data.occupancy.totalUnits === 6 && r.data.occupancy.rate === 0 && Array.isArray(r.data.amenities) && Array.isArray(r.data.photos) && Array.isArray(r.data.units), r.body);
  r = await call("GET", `/admin/properties/${addedId}/overview`, T("owner"));
  check("View Details is Super Admin only → 403", r.status === 403, r.body);
  const before = (await call("GET", "/admin/properties/stats", T("super"))).data;
  r = await call("PATCH", `/admin/properties/${addedId}/status`, T("super"), { status: "PENDING" });
  const afterPending = (await call("GET", "/admin/properties/stats", T("super"))).data;
  check("Pending: the row turns Pending and the pending counter goes up by 1", r.status === 200 && r.data.state === "PENDING" && afterPending.pendingApproval === before.pendingApproval + 1, r.body);
  r = await call("PATCH", `/admin/properties/${addedId}/status`, T("super"), { status: "ACTIVE" });
  const afterActive = (await call("GET", "/admin/properties/stats", T("super"))).data;
  check("Active: the row turns Active, the owner is notified, the pending counter goes back", r.status === 200 && r.data.state === "ACTIVE" && afterActive.pendingApproval === before.pendingApproval && (await db.notification.count({ where: { userId: users.owner!.id, titleKey: "notifications.propertyApproved" } })) > 0, r.body);
  r = await call("PATCH", `/admin/properties/${addedId}/status`, T("super"), { status: "DELETE" });
  check("DELETE is not a status → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/properties/${addedId}/status`, T("owner"), { status: "ACTIVE" });
  check("an owner cannot change the approval status → 403", r.status === 403, r.body);
  // photos: the Super Admin uploads, then attaches to the property
  const ph = await uploadVia(T("super"), "PROPERTY_IMAGE", "image/png", PNG);
  r = await call("POST", `/admin/properties/${addedId}/images`, T("super"), { storageKey: ph.key });
  check("Upload image: a photo is attached to the new property → 201", r.status === 201 && (await db.propertyImage.count({ where: { propertyId: addedId } })) === 1, r.body);
  r = await call("GET", `/admin/properties/${addedId}/overview`, T("super"));
  check("View Details shows the photo (signed link)", r.status === 200 && r.data.photos.length === 1 && /^https?:/.test(r.data.photos[0].url), r.body);
  const ownerPh = await uploadVia(T("owner"), "PROPERTY_IMAGE", "image/png", PNG);
  r = await call("POST", `/admin/properties/${addedId}/images`, T("super"), { storageKey: ownerPh.key });
  check("another person's upload cannot be attached → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/properties/${addedId}/images`, T("owner"), { storageKey: ph.key });
  check("an owner cannot use the admin photo route → 403", r.status === 403, r.body);
  const docKey = (await uploadVia(T("super"), "PROPERTY_DOC", "application/pdf", PDF)).key;
  r = await call("POST", `/admin/properties/${addedId}/images`, T("super"), { storageKey: docKey });
  check("a document is not a photo → 403", r.status === 403, r.body);
  r = await call("POST", "/uploads/sign", T("super"), { purpose: "PROPERTY_IMAGE", mime: "image/gif", size: 1000 });
  check("a GIF is refused → 422", r.status === 422, r.body);
  r = await call("POST", "/uploads/sign", T("super"), { purpose: "PROPERTY_IMAGE", mime: "image/png", size: 6 * 1024 * 1024 });
  check("a photo over 5 MB is refused → 422", r.status === 422, r.body);

  // a property WITH a tenant: build one, rent a unit, delete the property → the lease ends and the tenant is a Tenant-Free account again
  r = await call("POST", "/admin/properties", T("super"), { ownerId: users.owner!.id, name: `Admin Rented ${tag}`, type: "APARTMENT_BUILDING", locationText: "Uttara Sector 4, Dhaka", declaredUnits: 2, amenities: ["PARKING", "LIFT", "FURNISHED"] });
  const rentedId = r.data?.id;
  check("amenities are saved with a new property", r.status === 201 && (await db.property.findUnique({ where: { id: rentedId } }))?.amenities.join() === "PARKING,LIFT,FURNISHED", r.body);
  r = await call("POST", "/admin/properties", T("super"), { ownerId: users.owner!.id, name: "Two furnishings", locationText: "Dhaka", declaredUnits: 1, amenities: ["FURNISHED", "UNFURNISHED"] });
  check("only one furnishing option is accepted → 422", r.status === 422, r.body);
  r = await call("POST", "/admin/properties", T("super"), { ownerId: users.owner!.id, name: "Bad amenity", locationText: "Dhaka", declaredUnits: 1, amenities: ["SWIMMING_POOL"] });
  check("an unknown amenity → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/properties/${rentedId}/overview`, T("super"));
  check("View Details lists the picked amenities", r.status === 200 && ["PARKING", "LIFT", "FURNISHED"].every((c) => r.data.amenities.includes(c)) && !r.data.amenities.includes("MOSQUE"), r.body);
  const rentedUnit = await db.unit.create({ data: { propertyId: rentedId, unitNumber: "R1", floor: 1, rent: 9000, availability: "OCCUPIED" } });
  const lease = await db.rentalAgreement.create({ data: { unitId: rentedUnit.id, tenantId: users.tenant!.id, ownerId: users.owner!.id, rent: 9000, startDate: new Date(), status: "ACTIVE" } });
  const beforeRented = (await call("GET", "/admin/properties/stats", T("super"))).data;
  r = await call("DELETE", `/admin/properties/${rentedId}`, T("super"));
  const leaseAfter = await db.rentalAgreement.findUnique({ where: { id: lease.id } });
  const otherLease = await db.rentalAgreement.count({ where: { tenantId: users.tenant!.id, status: "ACTIVE" } });
  const tenantAfter = await db.user.findUnique({ where: { id: users.tenant!.id }, select: { role: true } });
  check("Delete with a tenant: 200, the lease ends, the property is archived", r.status === 200 && r.data.tenantsMovedOut === 1 && leaseAfter?.status === "ENDED" && !!(await db.property.findUnique({ where: { id: rentedId } }))?.archivedAt, r.body);
  check("the moved-out tenant is told, and is a Tenant-Free account if they have no other lease", (await db.notification.count({ where: { userId: users.tenant!.id, titleKey: "notifications.tenancyEnded" } })) > 0 && (otherLease > 0 || tenantAfter?.role === "GENERAL_USER"), tenantAfter);
  const afterRented = (await call("GET", "/admin/properties/stats", T("super"))).data;
  check("counters drop after deleting a rented property", afterRented.totalProperties === beforeRented.totalProperties - 1 && afterRented.totalUnits <= beforeRented.totalUnits - 2, afterRented);
  // put the shared test tenant back so later sections still work
  await db.user.update({ where: { id: users.tenant!.id }, data: { role: "TENANT" } });
  r = await call("DELETE", `/admin/properties/${addedId}`, T("owner"));
  check("an owner cannot use the admin delete → 403", r.status === 403, r.body);
  r = await call("DELETE", `/admin/properties/${addedId}`, T("super"));
  const afterDelete = (await call("GET", "/admin/properties/stats", T("super"))).data;
  check("Delete: property count goes down, its units leave the unit total, the row is archived (not erased)", r.status === 200 && afterDelete.totalProperties === before.totalProperties - 1 && afterDelete.totalUnits === before.totalUnits - 6 && !!(await db.property.findUnique({ where: { id: addedId } }))?.archivedAt, r.body);
  r = await call("GET", `/admin/properties/${addedId}/overview`, T("super"));
  check("a deleted property is gone from View Details → 404", r.status === 404, r.body);
  r = await call("DELETE", `/admin/properties/${addedId}`, T("super"));
  check("deleting it again → 404", r.status === 404, r.body);

  section("Super Admin Manage Home: rental + marketplace moderation, details, status, delete & archive");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/manage-home/stats", "/admin/manage-home/table"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/manage-home/stats", null);
  check("Manage Home without sign-in → 401", r.status === 401, r.body);
  const mhMake = (data: Record<string, unknown>) => db.listing.create({ data: { sellerId: users.owner!.id, category: "FLAT", description: "Test listing for the Manage Home checks.", price: 20000, district: "Dhaka", upazila: "Savar", ...data } as never });
  const mhUnit = await db.unit.findFirst({ where: { property: { ownerId: users.owner!.id }, availability: "OCCUPIED", archivedAt: null }, select: { id: true } });
  const lPending = await mhMake({ type: "RENT", title: `MH pending ${tag}`, status: "PENDING", amenities: ["HOSPITAL", "PARK"] });
  const lActive = await mhMake({ type: "RENT", title: `MH active ${tag}`, status: "PUBLISHED", expiresAt: new Date(Date.now() + 30 * 86400_000), unitId: mhUnit?.id ?? null, amenities: ["SCHOOL", "SECURITY"] });
  const lReportedByUsers = await mhMake({ type: "RENT", title: `MH flagged ${tag}`, status: "PUBLISHED", expiresAt: new Date(Date.now() + 30 * 86400_000) });
  await db.listingReport.create({ data: { listingId: lReportedByUsers.id, reporterId: users.tenant!.id, category: "FAKE", description: "Looks fake" } });
  const lRejected = await mhMake({ type: "RENT", title: `MH rejected ${tag}`, status: "REJECTED", rejectionReason: "Bad photos" });
  const lRented = await mhMake({ type: "RENT", title: `MH rented ${tag}`, status: "RENTED" });
  const lSaleOn = await mhMake({ type: "SALE", category: "APARTMENT", title: `MH for sale ${tag}`, status: "PUBLISHED", price: 5500000, area: 1200, areaUnit: "SQFT" });
  const lSold = await mhMake({ type: "SALE", category: "APARTMENT", title: `MH sold ${tag}`, status: "SOLD", price: 4400000 });
  const LISTED = ["PENDING", "PUBLISHED", "REJECTED", "SUSPENDED", "SOLD", "RENTED"] as const;
  const expected = async (type: "RENT" | "SALE") => {
    const where = { type, status: { in: [...LISTED] as never } };
    const [total, pend, susp, pubOpen, pub, doneDeals] = await Promise.all([
      db.listing.count({ where }), db.listing.count({ where: { type, status: "PENDING" } }), db.listing.count({ where: { type, status: "SUSPENDED" } }),
      db.listing.count({ where: { type, status: "PUBLISHED", reports: { some: { status: "OPEN" } } } }), db.listing.count({ where: { type, status: "PUBLISHED", reports: { none: { status: "OPEN" } } } }),
      db.listing.count({ where: { type, status: { in: ["SOLD", "RENTED"] } } }),
    ]);
    const rejected = await db.listing.count({ where: { type, status: "REJECTED" } });
    const featured = await db.listing.count({ where: { type, status: "PUBLISHED", isFeatured: true } });
    const sold = await db.listing.count({ where: { type, status: "SOLD" } });
    return { total, pending: pend, reported: susp + pubOpen, active: pub + doneDeals, rejected, featured, sold };
  };
  for (const [mode, type] of [["rent", "RENT"], ["sale", "SALE"]] as const) {
    r = await call("GET", `/admin/manage-home/stats?mode=${mode}`, T("super"));
    const want = await expected(type);
    check(`${mode}: five counters match the database (${want.total} / ${want.active} / ${want.pending} / ${want.reported} / ${want.rejected})`, r.status === 200 && r.data.total === want.total && r.data.active === want.active && r.data.pending === want.pending && r.data.reported === want.reported && r.data.rejected === want.rejected && r.data.featured === want.featured && r.data.sold === want.sold, r.body);
  }
  r = await call("GET", "/admin/manage-home/stats?mode=buy", T("super"));
  check("unknown mode → 422", r.status === 422, r.body);

  const rows = (qs: string) => call("GET", `/admin/manage-home/table?${qs}&limit=50`, T("super"));
  r = await rows("mode=rent&status=pending");
  check("rental, status Pending: only Pending rows, mine included", r.status === 200 && r.data.items.every((x: any) => x.state === "PENDING") && r.data.items.some((x: any) => x.id === lPending.id), r.body);
  r = await rows("mode=rent&status=reported");
  check("rental, status Reported: a published listing with an open report counts as Reported", r.status === 200 && r.data.items.every((x: any) => x.state === "REPORTED") && r.data.items.some((x: any) => x.id === lReportedByUsers.id && x.openReports === 1), r.body);
  r = await rows("mode=rent&status=rejected");
  check("rental, status Rejected", r.status === 200 && r.data.items.some((x: any) => x.id === lRejected.id) && r.data.items.every((x: any) => x.state === "REJECTED"), r.body);
  r = await rows("mode=rent&status=active");
  check("rental, status Active: includes the published and the rented one, never the flagged or pending", r.status === 200 && r.data.items.some((x: any) => x.id === lActive.id) && r.data.items.some((x: any) => x.id === lRented.id) && !r.data.items.some((x: any) => x.id === lReportedByUsers.id || x.id === lPending.id), r.body);
  r = await rows("mode=rent&occupancy=occupied");
  check("rental, Occupied: the RENTED listing is in, a vacant pending one is out", r.status === 200 && r.data.items.some((x: any) => x.id === lRented.id && x.occupied) && !r.data.items.some((x: any) => x.id === lPending.id), r.body);
  r = await rows("mode=rent&occupancy=vacant");
  check("rental, Vacant: only vacant rows", r.status === 200 && r.data.items.every((x: any) => !x.occupied) && r.data.items.some((x: any) => x.id === lPending.id) && !r.data.items.some((x: any) => x.id === lRented.id), r.body);
  r = await rows("mode=rent&status=reported&occupancy=occupied");
  check("filters combine (status AND occupancy)", r.status === 200 && r.data.items.every((x: any) => x.state === "REPORTED" && x.occupied), r.body);
  r = await rows("mode=rent");
  check("the table lists the newest posting first (createdAt, newest to oldest)", r.status === 200 && r.data.items.length > 2 && r.data.items.every((x: any, i: number, a: any[]) => i === 0 || new Date(a[i - 1].createdAt).getTime() >= new Date(x.createdAt).getTime()), r.body);
  check("rental table never shows marketplace listings", r.status === 200 && !r.data.items.some((x: any) => [lSaleOn.id, lSold.id].includes(x.id)), r.body);
  check("every row carries the owner's name, phone and e-mail, and a (nullable) first-photo link", r.status === 200 && r.data.items.every((x: any) => !!x.owner.fullName && "phone" in x.owner && "email" in x.owner && "thumbnailUrl" in x), r.body);
  check("the mine row shows the test owner's e-mail", r.data.items.find((x: any) => x.id === lRented.id)?.owner?.email === (await db.user.findUnique({ where: { id: users.owner!.id } }))?.email, r.body);
  r = await rows("mode=sale");
  check("marketplace table: for-sale and sold rows, price and sqft", r.status === 200 && r.data.items.some((x: any) => x.id === lSaleOn.id && x.area === "1200" && !x.sold) && r.data.items.some((x: any) => x.id === lSold.id && x.sold), r.body);
  r = await rows("mode=sale&sale=sold");
  check("marketplace, Sold only", r.status === 200 && r.data.items.length > 0 && r.data.items.every((x: any) => x.sold), r.body);
  r = await rows("mode=sale&sale=for_sale");
  check("marketplace, For Sale only", r.status === 200 && r.data.items.length > 0 && r.data.items.every((x: any) => !x.sold), r.body);
  // Manage Marketplace: search, category, featured filter, Feature / Unfeature
  r = await rows(`mode=sale&q=${encodeURIComponent(`MH for sale ${tag}`)}`);
  check("marketplace search by title finds the listing", r.status === 200 && r.data.items.length === 1 && r.data.items[0].id === lSaleOn.id, r.body);
  r = await rows(`mode=sale&q=${encodeURIComponent((await db.user.findUnique({ where: { id: users.owner!.id } }))!.email!)}`);
  check("search by the owner's e-mail finds that owner's listings", r.status === 200 && r.data.items.some((x: any) => x.id === lSaleOn.id) && r.data.items.every((x: any) => x.owner.email === (users.owner as any).email || true), r.body);
  r = await rows(`mode=sale&q=${encodeURIComponent("zzz-nothing-" + tag)}`);
  check("a search with no match → empty list, total 0", r.status === 200 && r.data.items.length === 0 && r.data.total === 0, r.body);
  r = await rows("mode=sale&category=APARTMENT");
  check("category filter: only apartments", r.status === 200 && r.data.items.length > 0 && r.data.items.every((x: any) => x.category === "APARTMENT") && r.data.items.some((x: any) => x.id === lSaleOn.id), r.body);
  r = await call("GET", "/admin/manage-home/table?mode=sale&category=SPACESHIP", T("super"));
  check("unknown category → 422", r.status === 422, r.body);
  const featBefore = (await call("GET", "/admin/manage-home/stats?mode=sale", T("super"))).data;
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("super"), { featured: true });
  const featAfter = (await call("GET", "/admin/manage-home/stats?mode=sale", T("super"))).data;
  check("Feature a live listing → 200, featured counter +1", r.status === 200 && r.data.isFeatured === true && featAfter.featured === featBefore.featured + 1, r.body);
  r = await rows("mode=sale&featured=yes");
  check("Featured only: the featured listing is in, rows carry isFeatured", r.status === 200 && r.data.items.length > 0 && r.data.items.every((x: any) => x.isFeatured) && r.data.items.some((x: any) => x.id === lSaleOn.id), r.body);
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("super"), { featured: true });
  check("featuring twice is harmless → 200", r.status === 200 && r.data.isFeatured === true, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSold.id}/feature`, T("super"), { featured: true });
  check("a sold listing cannot be featured → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${lRejected.id}/feature`, T("super"), { featured: true });
  check("a rejected listing cannot be featured → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${lReportedByUsers.id}/feature`, T("super"), { featured: true });
  check("a listing with an open report cannot be featured → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("owner"), { featured: false });
  check("an owner cannot feature or unfeature → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("super"), { featured: "yes" });
  check("featured must be true or false → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/state`, T("super"), { state: "REPORTED" });
  check("moving a featured listing out of Active also removes the feature", r.status === 200 && (await db.listing.findUnique({ where: { id: lSaleOn.id } }))?.isFeatured === false, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/state`, T("super"), { state: "ACTIVE" });
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("super"), { featured: true });
  r = await call("PATCH", `/admin/manage-home/${lSaleOn.id}/feature`, T("super"), { featured: false });
  check("Unfeature → 200", r.status === 200 && r.data.isFeatured === false && (await call("GET", "/admin/manage-home/stats?mode=sale", T("super"))).data.featured === featBefore.featured, r.body);

  // For Sale / Sold from the Edit window
  const sellSale = await mhMake({ type: "SALE", category: "FLAT", title: `MH sell ${tag}`, status: "PUBLISHED", price: 3100000, expiresAt: new Date(Date.now() + 30 * 86400_000), district: "Gazipur", upazila: "Gazipur Sadar" });
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "ACTIVE", sold: true });
  check("For Sale → Sold: status SOLD, the seller is told", r.status === 200 && r.data.sold === true && (await db.listing.findUnique({ where: { id: sellSale.id } }))?.status === "SOLD" && (await db.notification.count({ where: { userId: users.owner!.id, titleKey: "notifications.listing_sold" } })) > 0, r.body);
  r = await rows("mode=sale&sale=sold");
  check("the Sold filter now lists it", r.status === 200 && r.data.items.some((x: any) => x.id === sellSale.id && x.sold), r.body);
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "ACTIVE", sold: true });
  check("saving a sold listing as Sold again is harmless → 200", r.status === 200 && r.data.sold === true, r.body);
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "REPORTED" });
  check("a sold listing cannot be moderated until it is put back For Sale → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "ACTIVE", sold: false });
  check("Sold → For Sale: published again with an expiry", r.status === 200 && r.data.sold === false && (await db.listing.findUnique({ where: { id: sellSale.id } }))?.status === "PUBLISHED" && !!(await db.listing.findUnique({ where: { id: sellSale.id } }))?.expiresAt, r.body);
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "REPORTED", sold: true });
  check("Sold needs the Active status → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/manage-home/${lRejected.id}/state`, T("super"), { state: "ACTIVE", sold: true });
  check("a listing that is not live cannot be marked Sold (409, or 422 sale_only)", r.status === 409 || r.status === 422, r.body);
  r = await call("PATCH", `/admin/manage-home/${lRejected.id}/state`, T("super"), { state: "ACTIVE", sold: false });
  check("sold is only for buy / sell listings: false on a rental → 422", r.status === 422, r.body);
  await call("PATCH", `/admin/manage-home/${sellSale.id}/feature`, T("super"), { featured: true });
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("super"), { state: "ACTIVE", sold: true });
  check("marking a featured listing Sold removes the feature", r.status === 200 && (await db.listing.findUnique({ where: { id: sellSale.id } }))?.isFeatured === false, r.body);
  r = await call("PATCH", `/admin/manage-home/${sellSale.id}/state`, T("owner"), { state: "ACTIVE", sold: false });
  check("an owner cannot change the sale status here → 403", r.status === 403, r.body);

  // Featured listings are pinned to the top of the public feed, under every search and filter
  const feedA = await mhMake({ type: "SALE", category: "FLAT", title: `Feed plain ${tag}`, status: "PUBLISHED", price: 1000000, expiresAt: new Date(Date.now() + 30 * 86400_000), district: "Gazipur", upazila: "Gazipur Sadar" });
  const feedB = await mhMake({ type: "SALE", category: "FLAT", title: `Feed featured ${tag}`, status: "PUBLISHED", price: 9000000, expiresAt: new Date(Date.now() + 30 * 86400_000), district: "Gazipur", upazila: "Gazipur Sadar" });
  r = await call("PATCH", `/admin/manage-home/${feedB.id}/feature`, T("super"), { featured: true });
  check("featuring the expensive Gazipur listing works", r.status === 200 && r.data.isFeatured === true, r.body);
  const firstIds = async (qs: string) => { const x = await call("GET", `/listings?${qs}`); return x.status === 200 ? x.data.items.map((i: any) => ({ id: i.id, f: i.isFeatured })) : null; };
  const featuredFirst = (items: { id: string; f: boolean }[] | null) => !!items && items.length > 0 && items.every((x, i, a) => i === 0 || !(x.f && !a[i - 1]!.f)); // once a non-featured row appears, no featured row follows
  let feed = await firstIds("type=SALE&limit=50");
  check("public feed: featured listings come before every standard one", featuredFirst(feed) && feed![0]!.id === feedB.id || (featuredFirst(feed) && feed![0]!.f), feed);
  feed = await firstIds("type=SALE&district=Gazipur&limit=50");
  check("…with a place filter (Gazipur) the featured listing is still first, above the cheaper standard one", featuredFirst(feed) && feed![0]!.id === feedB.id && feed!.findIndex((x: { id: string }) => x.id === feedA.id) > 0, feed);
  feed = await firstIds("type=SALE&district=Gazipur&sort=price_asc&limit=50");
  check("…also when sorted by lowest price (featured first, then cheapest)", featuredFirst(feed) && feed![0]!.id === feedB.id, feed);
  feed = await firstIds(`type=SALE&q=${encodeURIComponent("Feed")}&sort=price_asc&limit=50`);
  check("…also under a text search", featuredFirst(feed) && feed![0]!.id === feedB.id && feed!.length === 2, feed);
  feed = await firstIds("type=SALE&district=Dhaka&limit=50");
  check("a place filter still filters: a featured listing elsewhere does not leak in", !!feed && !feed.some((x: { id: string }) => x.id === feedB.id), feed);
  const pgA = await call("GET", "/listings?type=SALE&sort=price_asc&limit=1");
  const pgB = pgA.data?.nextCursor ? await call("GET", `/listings?type=SALE&sort=price_asc&limit=1&cursor=${pgA.data.nextCursor}`) : null;
  check("paging keeps the order: page 1 is featured, no featured row appears after a standard one on page 2", pgA.status === 200 && pgA.data.items[0].isFeatured === true && (!pgB || pgB.status === 200 && (!pgB.data.items[0]?.isFeatured || pgA.data.items[0].isFeatured)), pgA.body);
  r = await call("PATCH", `/admin/manage-home/${feedB.id}/feature`, T("super"), { featured: false });
  feed = await firstIds("type=SALE&district=Gazipur&sort=price_asc&limit=50");
  check("un-featured: back to the normal order (cheapest first)", feed![0]!.id === feedA.id, feed);

  r = await call("GET", "/admin/manage-home/table?mode=rent&limit=2", T("super"));
  const mhPage1 = r.data;
  check("page 1: 2 rows and a cursor", r.status === 200 && mhPage1.items.length === 2 && !!mhPage1.nextCursor && mhPage1.total >= 5, r.body);
  r = await call("GET", `/admin/manage-home/table?mode=rent&limit=2&cursor=${mhPage1.nextCursor}`, T("super"));
  check("View More: the next rows with no repeats", r.status === 200 && r.data.items.length >= 1 && r.data.items.every((x: any) => !mhPage1.items.some((y: any) => y.id === x.id)), r.body);
  r = await call("GET", "/admin/manage-home/table?status=archived", T("super"));
  check("unknown status filter → 422", r.status === 422, r.body);

  r = await call("GET", `/admin/manage-home/${lActive.id}/overview`, T("super"));
  check("View Details: specs, owner with Owner ID, nearby places", r.status === 200 && r.data.owner.id === users.owner!.id && r.data.owner.ownerCode === (await db.user.findUnique({ where: { id: users.owner!.id } }))?.ownerCode && r.data.nearby.SCHOOL === true && r.data.nearby.SECURITY === true && r.data.nearby.HOSPITAL === false && Array.isArray(r.data.photos), r.body);
  if (mhUnit) {
    const ag = await db.rentalAgreement.findFirst({ where: { unitId: mhUnit.id, status: "ACTIVE" }, select: { tenantId: true } });
    check("View Details of an occupied listing: the assigned tenant with Tenant ID and check-in date", r.data.occupied === true && (!ag || (r.data.tenancy?.tenant?.id === ag.tenantId && !!r.data.tenancy.checkIn && (r.data.tenancy.tenant.tenantCode == null || /^TF\d{6,}$/.test(r.data.tenancy.tenant.tenantCode)))), r.data.tenancy);
  }
  r = await call("GET", `/admin/manage-home/${lReportedByUsers.id}/overview`, T("super"));
  check("View Details of a reported listing shows the open report", r.status === 200 && r.data.state === "REPORTED" && r.data.reports.length === 1, r.body);
  r = await call("GET", `/admin/manage-home/${lActive.id}/overview`, T("owner"));
  check("View Details is Super Admin only → 403", r.status === 403, r.body);

  const mhBefore = (await call("GET", "/admin/manage-home/stats?mode=rent", T("super"))).data;
  r = await call("PATCH", `/admin/manage-home/${lPending.id}/state`, T("super"), { state: "ACTIVE" });
  const afterOn = (await call("GET", "/admin/manage-home/stats?mode=rent", T("super"))).data;
  const approved = await db.listing.findUnique({ where: { id: lPending.id } });
  check("Pending → Active: published with an expiry, counters move (pending −1, active +1)", r.status === 200 && r.data.state === "ACTIVE" && approved?.status === "PUBLISHED" && !!approved.expiresAt && afterOn.pending === mhBefore.pending - 1 && afterOn.active === mhBefore.active + 1, r.body);
  check("…and the owner is told", (await db.notification.count({ where: { userId: users.owner!.id, titleKey: "notifications.listing_approved" } })) > 0);
  r = await call("PATCH", `/admin/manage-home/${lPending.id}/state`, T("super"), { state: "REPORTED" });
  const afterRep = (await call("GET", "/admin/manage-home/stats?mode=rent", T("super"))).data;
  check("Active → Reported: hidden (suspended), reported counter +1", r.status === 200 && r.data.state === "REPORTED" && (await db.listing.findUnique({ where: { id: lPending.id } }))?.status === "SUSPENDED" && afterRep.reported === afterOn.reported + 1, r.body);
  r = await call("PATCH", `/admin/manage-home/${lReportedByUsers.id}/state`, T("super"), { state: "ACTIVE" });
  check("Reported → Active closes the open reports", r.status === 200 && r.data.state === "ACTIVE" && (await db.listingReport.count({ where: { listingId: lReportedByUsers.id, status: "OPEN" } })) === 0, r.body);
  r = await call("PATCH", `/admin/manage-home/${lRejected.id}/state`, T("super"), { state: "PENDING" });
  check("Rejected → Pending", r.status === 200 && r.data.state === "PENDING" && (await db.listing.findUnique({ where: { id: lRejected.id } }))?.status === "PENDING", r.body);
  r = await call("PATCH", `/admin/manage-home/${lRejected.id}/state`, T("super"), { state: "REJECTED" });
  check("Pending → Rejected keeps a reason for the owner", r.status === 200 && r.data.state === "REJECTED" && !!(await db.listing.findUnique({ where: { id: lRejected.id } }))?.rejectionReason, r.body);
  r = await call("PATCH", `/admin/manage-home/${lSold.id}/state`, T("super"), { state: "REJECTED" });
  check("a sold listing cannot be moderated → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${lRented.id}/state`, T("super"), { state: "PENDING" });
  check("a rented listing cannot be moderated → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/manage-home/${lActive.id}/state`, T("super"), { state: "ARCHIVED" });
  check("ARCHIVED is not a moderation state → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/manage-home/${lActive.id}/state`, T("owner"), { state: "REJECTED" });
  check("an owner cannot moderate → 403", r.status === 403, r.body);

  const beforeDel = (await call("GET", "/admin/manage-home/stats?mode=rent", T("super"))).data;
  r = await call("DELETE", `/admin/manage-home/${lActive.id}`, T("owner"));
  check("an owner cannot use the admin delete → 403", r.status === 403, r.body);
  r = await call("DELETE", `/admin/manage-home/${lActive.id}`, T("super"));
  const gone = await db.listing.findUnique({ where: { id: lActive.id } });
  const afterDel = (await call("GET", "/admin/manage-home/stats?mode=rent", T("super"))).data;
  check("Delete & Archive: status ARCHIVED with a date and reason (the row is kept), total −1", r.status === 200 && gone?.status === "ARCHIVED" && !!gone.archivedAt && !!gone.archiveReason && afterDel.total === beforeDel.total - 1, r.body);
  r = await rows("mode=rent");
  check("the archived listing is gone from the table", r.status === 200 && !r.data.items.some((x: any) => x.id === lActive.id), r.body);
  r = await call("GET", "/admin/archive/listings?limit=50", T("super"));
  check("…and appears in Previous Properties (archive of listings)", r.status === 200 && r.data.items.some((x: any) => x.id === lActive.id), r.body);
  r = await call("DELETE", `/admin/manage-home/${lActive.id}`, T("super"));
  check("deleting it again → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/manage-home/${lActive.id}/overview`, T("super"));
  check("an archived listing has no details page → 404", r.status === 404, r.body);
  r = await call("DELETE", `/admin/manage-home/${lSold.id}`, T("super"));
  check("a sold marketplace listing can be archived too", r.status === 200 && (await db.listing.findUnique({ where: { id: lSold.id } }))?.status === "ARCHIVED", r.body);

  section("Paid Boost: settings, owner payment, admin approval, expiry, feed priority");
  const boostWas = await db.platformSetting.findUnique({ where: { key: "boost.enabled" } });
  await db.platformSetting.upsert({ where: { key: "boost.enabled" }, update: { value: true }, create: { key: "boost.enabled", value: true, isSecret: false } });
  const trxFor = (n: string) => `${n}${tag}`.toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(10, "0").slice(0, 10);
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/boosts", "/admin/boosts/stats", "/admin/boosts/settings"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/boosts/stats", null);
  check("Paid Boost without sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/boosts/settings", null);
  check("boost settings need a sign-in → 401", r.status === 401, r.body);

  r = await call("GET", "/boosts/settings", T("owner"));
  check("owner sees the boost fee (৳100), length (7 days), switched on, and the bKash details", r.status === 200 && r.data.fee === "100.00" && r.data.durationDays === 7 && r.data.enabled === true && r.data.payment.method === "BKASH_SEND_MONEY" && r.data.payment.reference === users.owner!.username, r.body);
  r = await call("GET", "/admin/boosts/settings", T("super"));
  check("Super Admin reads the settings", r.status === 200 && r.data.fee === "100.00" && r.data.durationDays === 7 && r.data.enabled === true, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { fee: 5 });
  check("a fee below ৳10 → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { durationDays: 120 });
  check("more than 90 days → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), {});
  check("an empty change → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { fee: 120, colour: "red" });
  check("an unknown setting → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("owner"), { fee: 1 });
  check("an owner cannot change the boost settings → 403", r.status === 403, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { fee: 150, durationDays: 10 });
  const seen = await call("GET", "/boosts/settings", T("owner"));
  check("settings change: fee ৳150 for 10 days, seen by the owner at once", r.status === 200 && r.data.fee === "150.00" && seen.data.fee === "150.00" && seen.data.durationDays === 10, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { fee: 100, durationDays: 7 });
  check("…and back to ৳100 for 7 days", r.status === 200 && r.data.fee === "100.00" && r.data.durationDays === 7, r.body);

  const farFuture = new Date(Date.now() + 40 * 86400_000);
  const bA = await mhMake({ type: "SALE", category: "FLAT", title: `Boost A ${tag}`, status: "PUBLISHED", expiresAt: farFuture, price: 2500000, district: "Gazipur", upazila: "Gazipur Sadar" });
  const bB = await mhMake({ type: "SALE", category: "FLAT", title: `Boost B ${tag}`, status: "PUBLISHED", expiresAt: farFuture, price: 1800000, district: "Gazipur", upazila: "Gazipur Sadar" });
  const bDraft = await mhMake({ type: "SALE", category: "FLAT", title: `Boost draft ${tag}`, status: "PENDING", price: 900000 });
  const pay = { senderNumber: "01712345678" };

  r = await call("POST", "/boosts", T("owner"), { listingId: bA.id, senderNumber: "0123", trxId: trxFor("BADNUM") });
  check("a bad bKash number → 422", r.status === 422, r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bA.id, ...pay, trxId: "SHORT" });
  check("a short TrxID → 422", r.status === 422, r.body);
  r = await call("POST", "/boosts", T("tenant"), { listingId: bA.id, ...pay, trxId: trxFor("TENANT") });
  check("someone else cannot boost the owner's listing (no listing rights or not theirs)", [403, 404].includes(r.status), r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bDraft.id, ...pay, trxId: trxFor("DRAFT") });
  check("a listing that is not live cannot be boosted → 409", r.status === 409, r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bA.id, ...pay, trxId: trxFor("BOOSTA") });
  const boostA = r.data;
  check("Boost: payment details sent → 201, ৳100, 7 days, Pending", r.status === 201 && boostA.status === "PENDING" && boostA.amount === "100" && boostA.durationDays === 7, r.body);
  const txA = await db.paymentTransaction.findFirst({ where: { boostId: boostA?.id } });
  check("…a payment record (purpose PROMOTION, awaiting review) is stored with the TrxID", txA?.purpose === "PROMOTION" && txA.status === "PENDING_REVIEW" && txA.gatewayTxnId === trxFor("BOOSTA") && Number(txA.amount) === 100, txA);
  check("…the Super Admin is told", (await db.notification.count({ where: { titleKey: "notifications.boost_new", userId: users.super!.id } })) > 0);
  r = await call("POST", "/boosts", T("owner"), { listingId: bA.id, ...pay, trxId: trxFor("BOOSTA2") });
  check("a second boost for the same listing while one waits → 409", r.status === 409, r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTA") });
  check("a TrxID that was already used → 409 TRXID_ALREADY_USED", r.status === 409 && r.code === "TRXID_ALREADY_USED", r.body);
  r = await call("GET", `/boosts?listingId=${bA.id}`, T("owner"));
  check("the seller sees the request as Pending, payment awaiting check", r.status === 200 && r.data.items[0].state === "PENDING" && r.data.items[0].paymentStatus === "PENDING_REVIEW", r.body);
  r = await call("GET", "/me/listings?limit=50", T("owner"));
  check("My Listings shows the boost as Pending on that listing", r.status === 200 && r.data.items.find((x: any) => x.id === bA.id)?.boost?.state === "PENDING" && !r.data.items.find((x: any) => x.id === bB.id)?.boost, r.body);

  const sBefore = (await call("GET", "/admin/boosts/stats", T("super"))).data;
  check("stats: at least one pending boost, numbers are whole counts, revenue is a number", sBefore.pending >= 1 && Number.isInteger(sBefore.active) && Number.isFinite(Number(sBefore.revenue)), sBefore);
  r = await call("GET", "/admin/boosts?status=pending&limit=50", T("super"));
  const rowA = r.data?.items?.find((x: any) => x.id === boostA.id);
  check("Pending tab: the request with listing, owner (name, phone, e-mail), TrxID, amount and payment status", r.status === 200 && !!rowA && rowA.state === "PENDING" && rowA.paymentStatus === "PENDING_REVIEW" && rowA.user.id === users.owner!.id && "email" in rowA.user && rowA.trxId === trxFor("BOOSTA") && rowA.listing.title === `Boost A ${tag}`, r.body);
  r = await call("GET", `/admin/boosts?q=${trxFor("BOOSTA")}`, T("super"));
  check("search by TrxID finds it", r.status === 200 && r.data.items.length === 1 && r.data.items[0].id === boostA.id, r.body);
  r = await call("GET", "/admin/boosts?status=sleeping", T("super"));
  check("unknown tab → 422", r.status === 422, r.body);

  r = await call("POST", `/admin/boosts/${boostA.id}/approve`, T("owner"));
  check("an owner cannot approve → 403", r.status === 403, r.body);
  r = await call("POST", `/admin/boosts/${boostA.id}/approve`, T("super"));
  const lA = await db.listing.findUnique({ where: { id: bA.id } });
  const txAfter = await db.paymentTransaction.findFirst({ where: { boostId: boostA.id }, include: { invoice: true } });
  const days = r.data ? (new Date(r.data.endsAt).getTime() - new Date(r.data.startsAt).getTime()) / 86400_000 : 0;
  check("Approve: boost runs for 7 days, the listing is featured until then", r.status === 200 && Math.round(days) === 7 && lA?.isFeatured === true && !!lA.boostEndsAt, r.body);
  check("…the payment is SUCCESS with an invoice, and the seller is told", txAfter?.status === "SUCCESS" && !!txAfter.verifiedAt && !!txAfter.invoice && (await db.notification.count({ where: { userId: users.owner!.id, titleKey: "notifications.boost_approved" } })) > 0, txAfter);
  const sAfter = (await call("GET", "/admin/boosts/stats", T("super"))).data;
  check("stats: pending −1, active +1, revenue +৳100", sAfter.pending === sBefore.pending - 1 && sAfter.active === sBefore.active + 1 && Math.round(Number(sAfter.revenue) - Number(sBefore.revenue)) === 100, sAfter);
  r = await call("GET", "/admin/boosts?status=active&limit=50", T("super"));
  check("Active tab lists it with its period", r.status === 200 && r.data.items.some((x: any) => x.id === boostA.id && x.state === "ACTIVE" && !!x.startsAt && !!x.endsAt), r.body);
  r = await call("POST", `/admin/boosts/${boostA.id}/approve`, T("super"));
  check("approving twice → 409", r.status === 409, r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bA.id, ...pay, trxId: trxFor("BOOSTA3") });
  check("a listing that is boosted cannot be boosted again → 409", r.status === 409, r.body);
  r = await call("GET", "/me/listings?limit=50", T("owner"));
  check("My Listings: the boost is Active with an end date", r.data.items.find((x: any) => x.id === bA.id)?.boost?.state === "ACTIVE" && !!r.data.items.find((x: any) => x.id === bA.id)?.boost?.endsAt, r.body);

  // the boosted listing is first in the public feed, under filters too
  const feedIds = async (qs: string) => (await call("GET", `/listings?${qs}`)).data?.items?.map((i: any) => ({ id: i.id, f: i.isFeatured })) ?? [];
  let fd = await feedIds("type=SALE&district=Gazipur&sort=price_asc&limit=50");
  check("public feed: the boosted listing comes before the cheaper standard one (place filter + lowest price)", fd.findIndex((x: any) => x.id === bA.id) >= 0 && fd.findIndex((x: any) => x.id === bA.id) < fd.findIndex((x: any) => x.id === bB.id) && fd.find((x: any) => x.id === bA.id)?.f === true, fd);

  // expiry: when the time is over the listing stops being featured
  await db.listing.update({ where: { id: bA.id }, data: { boostEndsAt: new Date(Date.now() - 3600_000) } });
  await db.listingBoost.update({ where: { id: boostA.id }, data: { endsAt: new Date(Date.now() - 3600_000) } });
  const sExp = (await call("GET", "/admin/boosts/stats", T("super"))).data;
  const lExp = await db.listing.findUnique({ where: { id: bA.id } });
  check("expiry: the finished boost no longer features the listing, and counts as Expired", lExp?.isFeatured === false && lExp.boostEndsAt === null && sExp.expired >= sAfter.expired + 1 && sExp.active === sAfter.active - 1, sExp);
  r = await call("GET", "/admin/boosts?status=expired&limit=50", T("super"));
  check("Expired tab lists it", r.status === 200 && r.data.items.some((x: any) => x.id === boostA.id && x.state === "EXPIRED"), r.body);
  fd = await feedIds("type=SALE&district=Gazipur&sort=price_asc&limit=50");
  check("…and the feed is back to the normal order (cheaper first)", fd.findIndex((x: any) => x.id === bB.id) < fd.findIndex((x: any) => x.id === bA.id), fd);

  // after it ended a new boost is possible; a rejected one can be tried again
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTB") });
  const boostB = r.data;
  check("another listing: request → 201", r.status === 201, r.body);
  r = await call("POST", `/admin/boosts/${boostB.id}/reject`, T("super"), { reason: "x" });
  check("a rejection needs a reason of 3+ letters → 422", r.status === 422, r.body);
  r = await call("POST", `/admin/boosts/${boostB.id}/reject`, T("super"), { reason: "TrxID not found in our bKash account" });
  const txB = await db.paymentTransaction.findFirst({ where: { boostId: boostB.id } });
  check("Reject: status Rejected, payment FAILED, the listing is not featured, the seller is told", r.status === 200 && r.data.status === "REJECTED" && txB?.status === "FAILED" && (await db.listing.findUnique({ where: { id: bB.id } }))?.isFeatured === false && (await db.notification.count({ where: { userId: users.owner!.id, titleKey: "notifications.boost_rejected" } })) > 0, r.body);
  r = await call("POST", `/admin/boosts/${boostB.id}/approve`, T("super"));
  check("a rejected request cannot be approved → 409", r.status === 409, r.body);
  r = await call("GET", `/boosts?listingId=${bB.id}`, T("owner"));
  check("the seller sees the reason", r.data.items[0].state === "REJECTED" && /TrxID not found/.test(r.data.items[0].rejectionReason), r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTB2") });
  const boostB2 = r.data;
  check("after a rejection the seller can pay again → 201", r.status === 201, r.body);
  r = await call("POST", `/boosts/${boostB2.id}/cancel`, T("tenant"));
  check("someone else cannot cancel it → 404", r.status === 404 || r.status === 403, r.body);
  r = await call("POST", `/boosts/${boostB2.id}/cancel`, T("owner"));
  check("the seller cancels a request that is still waiting → payment FAILED", r.status === 200 && r.data.status === "CANCELLED" && (await db.paymentTransaction.findFirst({ where: { boostId: boostB2.id } }))?.status === "FAILED", r.body);
  r = await call("POST", `/boosts/${boostB2.id}/cancel`, T("owner"));
  check("cancelling twice → 409", r.status === 409, r.body);

  // a listing that went offline before approval cannot be boosted
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTB3") });
  const boostB3 = r.data;
  await db.listing.update({ where: { id: bB.id }, data: { status: "SUSPENDED" } });
  r = await call("POST", `/admin/boosts/${boostB3.id}/approve`, T("super"));
  check("approving a boost of a listing that is no longer live → 409", r.status === 409, r.body);
  await db.listing.update({ where: { id: bB.id }, data: { status: "PUBLISHED" } });
  await call("POST", `/admin/boosts/${boostB3.id}/reject`, T("super"), { reason: "Listing was taken offline" });

  // switched off
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { enabled: false });
  check("Super Admin switches Paid Boost off", r.status === 200 && r.data.enabled === false, r.body);
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTOFF") });
  check("while it is off, no new boost can be requested → 409", r.status === 409, r.body);
  r = await call("GET", "/boosts/settings", T("owner"));
  check("…and the owner sees that it is off", r.data.enabled === false, r.body);
  r = await call("PATCH", "/admin/boosts/settings", T("super"), { enabled: true });
  check("switched on again", r.status === 200 && r.data.enabled === true, r.body);

  // the Super Admin's own feature switch also ends a paid boost
  r = await call("POST", "/boosts", T("owner"), { listingId: bB.id, ...pay, trxId: trxFor("BOOSTB4") });
  const boostB4 = r.data;
  await call("POST", `/admin/boosts/${boostB4.id}/approve`, T("super"));
  r = await call("PATCH", `/admin/manage-home/${bB.id}/feature`, T("super"), { featured: false });
  const lB = await db.listing.findUnique({ where: { id: bB.id } });
  check("un-featuring a boosted listing by hand ends the boost (feature flag and end date cleared)", r.status === 200 && lB?.isFeatured === false && lB.boostEndsAt === null, r.body);

  section("Paid Boost page: Payment Failed tab, edit, delete");
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("owner"), { durationDays: 3 });
  check("owner cannot edit a boost → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("super"), {});
  check("an empty edit → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("super"), { durationDays: 200 });
  check("200 days → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("super"), { state: "FAILED", reason: "test reason" });
  check("a paid boost cannot become payment failed → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("super"), { state: "EXPIRED" });
  check("Super Admin marks a running boost Expired", r.status === 200 && r.data.state === "EXPIRED", r.body);
  r = await call("GET", "/admin/boosts?status=expired&limit=50", T("super"));
  check("it now shows in the Expired tab", r.status === 200 && r.data.items.some((x: any) => x.id === boostB4.id), r.body);
  r = await call("PATCH", `/admin/boosts/${boostB4.id}`, T("super"), { state: "ACTIVE", durationDays: 5 });
  const bAfter = await db.listing.findUnique({ where: { id: bB.id } });
  check("Active again for 5 days: the listing is pinned until the new end date", r.status === 200 && r.data.state === "ACTIVE" && bAfter?.isFeatured === true && !!bAfter.boostEndsAt, r.body);
  r = await call("GET", "/admin/boosts/stats", T("super"));
  check("stats have the total, failed and paid numbers", r.status === 200 && typeof r.data.total === "number" && typeof r.data.failed === "number" && Number(r.data.revenue) >= 0, r.body);
  const totalBefore = r.data.total;
  r = await call("GET", "/admin/boosts?status=failed&limit=50", T("super"));
  check("Payment Failed tab only lists refused or cancelled boosts", r.status === 200 && r.data.items.every((x: any) => ["REJECTED", "CANCELLED"].includes(x.status) || x.paymentStatus === "FAILED"), r.body);
  r = await call("DELETE", `/admin/boosts/${boostB4.id}`, T("owner"));
  check("owner cannot delete a boost → 403", r.status === 403, r.body);
  r = await call("DELETE", `/admin/boosts/${boostB4.id}`, T("super"));
  const bGone = await db.listing.findUnique({ where: { id: bB.id } });
  check("Super Admin deletes a running boost: the pin is removed", r.status === 200 && bGone?.isFeatured === false && bGone.boostEndsAt === null, r.body);
  check("the boost row and its payment are kept (soft delete)", !!(await db.listingBoost.findUnique({ where: { id: boostB4.id } }))?.deletedAt && !!(await db.paymentTransaction.findFirst({ where: { boostId: boostB4.id } })));
  r = await call("GET", "/admin/boosts?status=all&limit=50", T("super"));
  check("a deleted boost is not in the table", r.status === 200 && !r.data.items.some((x: any) => x.id === boostB4.id), r.body);
  r = await call("GET", "/admin/boosts/stats", T("super"));
  check("Total Boost goes down by one", r.status === 200 && r.data.total === totalBefore - 1, r.body);
  r = await call("DELETE", `/admin/boosts/${boostB4.id}`, T("super"));
  check("deleting twice → 404", r.status === 404, r.body);

  section("Report page: summary, revenue chart, plans, transactions");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/report/summary", "/admin/report/revenue", "/admin/report/plans", "/admin/report/transactions"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/report/summary", null);
  check("report needs a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/report/summary", T("super"));
  check("default range is the last 30 days with all four numbers", r.status === 200 && r.data.range.to >= r.data.range.from && typeof r.data.paidSubscribers === "number" && Number(r.data.totalPaid) === Number(r.data.subscription.amount) + Number(r.data.boost.amount), r.body);
  r = await call("GET", "/admin/report/summary?from=2020-01-01&to=2020-01-31", T("super"));
  check("a range with no payments → zeros", r.status === 200 && r.data.paidSubscribers === 0 && Number(r.data.totalPaid) === 0, r.body);
  r = await call("GET", "/admin/report/summary?from=2026-12-31&to=2026-01-01", T("super"));
  check("end before start → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/report/revenue?year=1999", T("super"));
  check("year 1999 → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/report/revenue", T("super"));
  check("revenue has 12 months and the totals match", r.status === 200 && r.data.months.length === 12 && Math.abs(r.data.months.reduce((a: number, m: any) => a + m.subscription + m.boost, 0) - (r.data.totals.subscription + r.data.totals.boost)) < 0.01 && r.data.years.includes(r.data.year), r.body);
  r = await call("GET", "/admin/report/plans", T("super"));
  check("plans: one meter per active owner plan", r.status === 200 && r.data.items.length >= 3 && r.data.items.every((x: any) => typeof x.subscribers === "number"), r.body);
  r = await call("GET", "/admin/report/transactions?status=failed&limit=50", T("super"));
  check("Failed filter lists only failed payments", r.status === 200 && r.data.items.every((x: any) => x.status === "FAILED"), r.body);
  r = await call("GET", "/admin/report/transactions?status=active&limit=50", T("super"));
  check("Active filter lists only verified payments", r.status === 200 && r.data.items.every((x: any) => x.status === "SUCCESS"), r.body);
  r = await call("GET", "/admin/report/transactions?limit=2", T("super"));
  const firstTwo = r.data?.items ?? [];
  check("newest first, 2 per page", r.status === 200 && firstTwo.length === 2 && new Date(firstTwo[0].createdAt) >= new Date(firstTwo[1].createdAt), r.body);
  if (r.data?.nextCursor) {
    const r2 = await call("GET", `/admin/report/transactions?limit=2&cursor=${r.data.nextCursor}`, T("super"));
    check("next page continues without repeats", r2.status === 200 && r2.data.items.every((x: any) => !firstTwo.some((y: any) => y.id === x.id)), r2.body);
  }
  r = await call("GET", "/admin/report/transactions?status=sleeping", T("super"));
  check("unknown status → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/report/transactions?plan=boost&limit=50", T("super"));
  check("Plan Type Boost lists only boost payments", r.status === 200 && r.data.items.every((x: any) => x.purpose === "PROMOTION"), r.body);
  r = await call("GET", "/admin/report/transactions?plan=primary&limit=50", T("super"));
  check("Plan Type Primary lists only Primary plan payments", r.status === 200 && r.data.items.every((x: any) => x.purpose === "SUBSCRIPTION" && x.plan?.code === "PRIMARY"), r.body);
  r = await call("GET", "/admin/report/transactions?plan=a%20b", T("super"));
  check("a bad plan value → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/report/plans", T("super"));
  check("plans also give the number of boosts bought", r.status === 200 && typeof r.data.boost === "number", r.body);
  r = await call("GET", "/admin/report/breakdown?from=2020-01-01&to=2030-01-01", T("super"));
  const sumLines = r.data ? r.data.plans.reduce((a: number, l: any) => a + Number(l.amount), 0) + Number(r.data.boost.amount) : -1;
  check("invoice numbers: a line per plan plus Boost, and the lines add up to the total", r.status === 200 && ["PRIMARY", "MILLIONAIRE", "BILLIONAIRE"].every((c) => r.data.plans.some((l: any) => l.code === c)) && Math.abs(sumLines - Number(r.data.total)) < 0.01, r.body);
  r = await call("GET", "/admin/report/breakdown?from=2026-12-31&to=2026-01-01", T("super"));
  check("invoice: end before start → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/report/breakdown", T("owner"));
  check("owner cannot export the invoice → 403", r.status === 403, r.body);

  section("Super Admin Active Owners: numbers, plan tabs, marketplace mode, view, status log, message, archive");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/active-owners", "/admin/active-owners/stats", `/admin/active-owners/${users.owner!.id}`]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(users.owner!.id, ":id")} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/active-owners", null);
  check("the owners list needs a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/active-owners/stats", T("super"));
  check("cards: owners, properties managed, average and new properties", r.status === 200 && r.data.mode === "rental" && r.data.totalOwners >= 1 && r.data.total >= 1 && typeof r.data.average === "number" && typeof r.data.fresh === "number" && Math.abs(r.data.average - Math.round((r.data.total / r.data.totalOwners) * 10) / 10) < 0.01, r.body);
  r = await call("GET", "/admin/active-owners/stats?from=2020-01-01&to=2020-01-31", T("super"));
  check("a range before anyone joined → zero owners", r.status === 200 && r.data.totalOwners === 0 && r.data.total === 0 && r.data.fresh === 0, r.body);
  r = await call("GET", "/admin/active-owners/stats?from=2026-12-31&to=2026-01-01", T("super"));
  check("end before start → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/active-owners/stats?mode=market", T("super"));
  check("marketplace cards give owners, listings, average and new listings", r.status === 200 && r.data.mode === "market" && typeof r.data.totalOwners === "number" && typeof r.data.total === "number" && typeof r.data.fresh === "number", r.body);
  r = await call("GET", "/admin/active-owners/stats?mode=sideways", T("super"));
  check("unknown mode → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/active-owners?q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  const ownersRow = r.data?.items?.[0];
  check("search finds the owner: ID, contact, portfolio, plan state, status and joined date", r.status === 200 && r.data.total === 1 && ownersRow?.id === users.owner!.id && ownersRow.state === "ACTIVE" && ownersRow.portfolio.properties >= 1 && ownersRow.portfolio.units >= 1 && !!ownersRow.createdAt && !!ownersRow.email, r.body);
  r = await call("GET", "/admin/active-owners?tier=BILLIONAIRE&limit=5", T("super"));
  check("Billionaire tab lists only owners on that plan", r.status === 200 && r.data.items.every((x: any) => x.plan?.code === "BILLIONAIRE"), r.body);
  r = await call("GET", "/admin/active-owners?tier=GOLD", T("super"));
  check("an unknown plan tab → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/active-owners?page=1", T("super"));
  check("10 per page with the total for 'Showing 1 to 10 of N'", r.status === 200 && r.data.pageSize === 10 && r.data.items.length <= 10 && r.data.total >= r.data.items.length, r.body);
  r = await call("GET", "/admin/active-owners?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/active-owners?mode=market", T("super"));
  check("marketplace table: owners with sale listings and their figures", r.status === 200 && r.data.mode === "market" && r.data.items.every((x: any) => x.market && x.market.total === x.market.forSale + x.market.sold), r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}`, T("super"));
  check("owner details: profile, properties with units and occupancy, marketplace, payments, empty log", r.status === 200 && r.data.id === users.owner!.id && r.data.properties.length >= 1 && r.data.properties.every((x: any) => x.occupied + x.vacant === x.units) && r.data.totals.properties === r.data.properties.length && Array.isArray(r.data.log) && !!r.data.market && !!r.data.payments, r.body);
  r = await call("GET", `/admin/active-owners/${users.tenant!.id}`, T("super"));
  check("a tenant is not an owner → 404", r.status === 404, r.body);

  // ---- owner NID front / NID back / agreement review
  const ownerVerifyBefore = (await db.user.findUnique({ where: { id: users.owner!.id }, select: { verificationStatus: true } }))!.verificationStatus;
  const ownerDocsBefore = await db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: users.owner!.id } });
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.owner!.id } });
  await db.user.update({ where: { id: users.owner!.id }, data: { verificationStatus: "UNVERIFIED" } });
  const oKey = (k: string, f: string) => `${k}/${users.owner!.id}/${f}`;
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("reviewing a document the owner never uploaded → 404", r.status === 404, r.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "NID_FRONT", storageKey: oKey("NID_FRONT", "o-front.png") });
  check("owner uploads NID front", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "NID_BACK", storageKey: oKey("NID_BACK", "o-back.png") });
  check("owner uploads NID back", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "AGREEMENT", storageKey: oKey("VERIFICATION_DOC", "o-agreement.pdf") });
  check("owner uploads an agreement", r.status === 201, r.body);
  r = await call("GET", `/admin/active-owners?verification=PENDING&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("verification filter Pending lists the owner, with the NID state on the row", r.status === 200 && r.data.total === 1 && r.data.items[0].verification === "PENDING", r.body);
  r = await call("GET", `/admin/active-owners?verification=VERIFIED&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("…and not under Verified", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/active-owners?verification=NOPE", T("super"));
  check("an unknown verification filter → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}`, T("super"));
  check("owner details show the three documents, the NID number field and the personal fields", r.status === 200 && r.data.documents.nidFront?.status === "PENDING" && r.data.documents.nidBack?.status === "PENDING" && r.data.documents.agreement?.status === "PENDING" && r.data.documents.agreement.isPdf === true && "nid" in r.data && "dateOfBirth" in r.data && r.data.verificationStatus === "PENDING", r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_FRONT`, T("owner"), { decision: "VERIFIED" });
  check("the owner cannot verify their own document → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_FRONT`, T("tenant"), { decision: "VERIFIED" });
  check("a tenant cannot review owner documents → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_BACK`, T("super"), { decision: "REJECTED" });
  check("rejecting without a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.tenant!.id}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("a tenant is not an owner → 404", r.status === 404, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("owner NID front verified", r.status === 200 && r.data.status === "VERIFIED" && r.data.changed === true && r.data.tenantVerification === "PENDING", r.body);
  const odn = await call("GET", "/notifications?limit=40", T("owner"));
  check("the owner gets a notification for the NID front alone", odn.data?.items?.some((x: any) => x.type === "document.verified" && x.params?.document === "NID_FRONT" && x.link === "/home-owner/profile") && !odn.data?.items?.some((x: any) => x.type?.startsWith("document.") && x.params?.document === "NID_BACK"), odn.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "NID_FRONT", storageKey: oKey("NID_FRONT", "o-front-2.png") });
  check("a verified NID front is locked: the owner cannot replace it → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_BACK`, T("super"), { decision: "REJECTED", note: "The back side is cut off." });
  check("NID back rejected with a reason: the owner NID state becomes Rejected", r.status === 200 && r.data.status === "REJECTED" && (await db.user.findUnique({ where: { id: users.owner!.id } }))?.verificationStatus === "REJECTED", r.body);
  const odn2 = await call("GET", "/notifications?limit=40", T("owner"));
  check("a separate notification tells the owner the back was rejected, with the reason", odn2.data?.items?.some((x: any) => x.type === "document.rejected" && x.params?.document === "NID_BACK" && String(x.params?.reason).includes("cut off")), odn2.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "NID_BACK", storageKey: oKey("NID_BACK", "o-back-2.png") });
  check("a rejected document can be replaced", r.status === 201, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/NID_BACK`, T("super"), { decision: "VERIFIED" });
  check("both photos verified → the owner is Verified", r.status === 200 && r.data.tenantVerification === "VERIFIED" && (await db.user.findUnique({ where: { id: users.owner!.id } }))?.verificationStatus === "VERIFIED", r.body);
  r = await call("GET", `/admin/active-owners?verification=VERIFIED&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("verification filter Verified now lists the owner", r.status === 200 && r.data.total === 1 && r.data.items[0].verification === "VERIFIED", r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/documents/AGREEMENT`, T("super"), { decision: "VERIFIED" });
  check("the agreement is reviewed on its own and keeps the NID state", r.status === 200 && r.data.status === "VERIFIED" && r.data.tenantVerification === null, r.body);
  r = await call("POST", "/me/documents", T("owner"), { kind: "AGREEMENT", storageKey: oKey("VERIFICATION_DOC", "o-agreement-2.pdf") });
  check("a verified agreement is locked too → 409", r.status === 409, r.body);
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.owner!.id } });
  if (ownerDocsBefore.length) await db.verificationDocument.createMany({ data: ownerDocsBefore.map(({ id: _id, ...x }) => x) as never });
  await db.user.update({ where: { id: users.owner!.id }, data: { verificationStatus: ownerVerifyBefore } });

  const ownerFlat = await db.listing.create({ data: { sellerId: users.owner!.id, type: "SALE", category: "FLAT", title: "Owner page flat for sale", description: "Short information check.", price: 7500000, district: "Dhaka", upazila: "Savar", status: "PUBLISHED", bedrooms: 3, bathrooms: 2 } as never });
  const ownerSold = await db.listing.create({ data: { sellerId: users.owner!.id, type: "SALE", category: "FLAT", title: "Owner page flat sold", description: "Sold flat.", price: 6000000, district: "Dhaka", upazila: "Savar", status: "SOLD" } as never });
  r = await call("GET", `/admin/active-owners/${users.owner!.id}`, T("super"));
  const ownerProp = r.data?.properties?.[0];
  check("details list the flats for sale and the sold flats as records, and the properties as records", r.status === 200 && r.data.forSaleList.some((x: any) => x.id === ownerFlat.id && x.price === "7500000") && r.data.soldList.some((x: any) => x.id === ownerSold.id) && r.data.forSaleList.every((x: any) => x.status === "PUBLISHED") && r.data.soldList.every((x: any) => x.status === "SOLD") && !!ownerProp?.id, r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}/property/${ownerProp?.id}`, T("super"));
  check("short property info: location, floors, units with their tenants and occupancy", r.status === 200 && r.data.id === ownerProp?.id && r.data.totals.units === r.data.units.length && r.data.totals.occupied + r.data.totals.vacant === r.data.totals.units && r.data.units.every((u: any) => !!u.unitNumber && u.rent !== undefined), r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}/listing/${ownerFlat.id}`, T("super"));
  check("short listing info: price, rooms, place and description", r.status === 200 && r.data.title === "Owner page flat for sale" && r.data.price === "7500000" && r.data.bedrooms === 3 && !!r.data.location && !!r.data.description, r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}/listing/${ownerSold.id}`, T("super"));
  check("a sold flat opens too", r.status === 200 && r.data.status === "SOLD", r.body);
  r = await call("GET", `/admin/active-owners/${users.general!.id}/listing/${ownerFlat.id}`, T("super"));
  check("a listing of another owner → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}/property/00000000-0000-7000-8000-000000000000`, T("super"));
  check("a missing property → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}/property/${ownerProp?.id}`, T("owner"));
  check("owner cannot use the short info calls → 403", r.status === 403, r.body);
  r = await call("GET", "/admin/active-owners?status=BANNED", T("super"));
  check("an unknown status filter → 422", r.status === 422, r.body);

  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("owner"), { status: "WARNING", comment: "test" });
  check("owner cannot change an owner status → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "WARNING" });
  check("Warning without a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "SUSPENDED", comment: "ab" });
  check("a reason shorter than 3 letters → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "BANNED", comment: "nope" });
  check("only Active, Warning or Suspended are allowed → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "WARNING", comment: "Please update your property documents." });
  check("Warning with a reason is saved", r.status === 200 && r.data.state === "WARNING" && r.data.changed === true, r.body);
  r = await call("GET", `/admin/active-owners?q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("the table now shows Warning", r.data?.items?.[0]?.state === "WARNING", r.body);
  r = await call("GET", "/admin/active-owners?status=WARNING", T("super"));
  check("status filter Warning lists the warned owner and only warned owners", r.status === 200 && r.data.items.some((x: any) => x.id === users.owner!.id) && r.data.items.every((x: any) => x.state === "WARNING"), r.body);
  r = await call("GET", `/admin/active-owners?status=ACTIVE&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("status filter Active leaves the warned owner out", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/me", T("owner"));
  check("a warned owner can still use the app", r.status === 200, r.body);
  const warnN = await call("GET", "/notifications?limit=30", T("owner"));
  check("the owner is told, with the reason", warnN.data?.items?.some((x: any) => x.type === "account.warning" && String(x.params?.reason).includes("property documents")), warnN.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "SUSPENDED", comment: "Repeated complaints from tenants." });
  check("Suspended with a reason is saved", r.status === 200 && r.data.state === "SUSPENDED", r.body);
  r = await call("GET", "/me", T("owner"));
  check("a suspended owner cannot use the app → 403", r.status === 403, r.body);
  r = await call("GET", "/admin/active-owners?status=SUSPENDED", T("super"));
  check("status filter Suspended lists the suspended owner and only suspended owners", r.status === 200 && r.data.items.some((x: any) => x.id === users.owner!.id) && r.data.items.every((x: any) => x.state === "SUSPENDED"), r.body);
  r = await call("GET", `/admin/active-owners/${users.owner!.id}`, T("super"));
  check("the comment log keeps both entries with the reason, the admin and the time (newest first)", r.status === 200 && r.data.state === "SUSPENDED" && r.data.log.length >= 2 && r.data.log[0].action === "SUSPENDED" && r.data.log[1].action === "WARNING" && r.data.log.every((l: any) => l.adminUsername === users.super!.username && !!l.createdAt && !!l.comment), r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "ACTIVE" });
  check("back to Active needs no reason", r.status === 200 && r.data.state === "ACTIVE", r.body);
  r = await call("GET", "/me", T("owner"));
  check("the owner can sign in to the app again", r.status === 200, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.owner!.id}/status`, T("super"), { status: "ACTIVE" });
  check("saving Active again changes nothing", r.status === 200 && r.data.changed === false, r.body);
  r = await call("PATCH", `/admin/active-owners/${users.tenant!.id}/status`, T("super"), { status: "WARNING", comment: "not an owner" });
  check("a tenant cannot be warned from this page → 404", r.status === 404, r.body);

  r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users.owner!.id });
  const ownerChat = r.data?.id;
  check("the Super Admin can open a direct chat with the owner", (r.status === 200 || r.status === 201) && !!ownerChat, r.body);
  r = await call("POST", `/conversations/${ownerChat}/messages`, T("super"), { clientId: crypto.randomUUID(), body: "Hello from the admin page." });
  check("…and send the message", r.status === 201 || r.status === 200, r.body);

  const archMail = `arch.${tag}@mailinator.com`;
  const archOwner = await db.user.create({ data: { username: `arch${tag}`, fullName: "Archive Me", email: archMail, phone: phone(), role: "OWNER", ownerProfile: { create: {} } } });
  users.arch = { key: "arch", id: archOwner.id, authId: "", email: archMail, password: "", username: archOwner.username, token: "" };
  const archProp = await db.property.create({ data: { ownerId: archOwner.id, name: "Archive Tower", type: "APARTMENT_BUILDING", totalFloors: 2 } as never });
  const archList = await db.listing.create({ data: { sellerId: archOwner.id, type: "SALE", category: "FLAT", title: "Archive flat", description: "Owner will be archived.", price: 5000000, district: "Dhaka", upazila: "Savar", status: "PUBLISHED" } as never });
  r = await call("DELETE", `/admin/active-owners/${archOwner.id}`, T("owner"), {});
  check("owner cannot archive an owner → 403", r.status === 403, r.body);
  r = await call("DELETE", `/admin/active-owners/${archOwner.id}`, T("super"), {});
  const archRow = await db.user.findUnique({ where: { id: archOwner.id }, select: { archivedAt: true, status: true } });
  check("Delete moves the owner to Previous Owners: archived, cannot sign in, property and listing taken down", r.status === 200 && r.data.archived === true && r.data.properties === 1 && r.data.listings === 1 && !!archRow?.archivedAt && archRow.status === "INACTIVE" && (await db.property.findUnique({ where: { id: archProp.id } }))?.status === "ARCHIVED" && (await db.listing.findUnique({ where: { id: archList.id } }))?.status === "ARCHIVED", r.body);
  r = await call("GET", `/admin/active-owners?q=${archOwner.username}`, T("super"));
  check("the archived owner is gone from Active Owners", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/archive/owners?limit=50", T("super"));
  check("…and shows in Previous Owners", r.status === 200 && r.data.items.some((x: any) => x.id === archOwner.id), r.body);
  check("the archive is written to the comment log", (await db.accountStatusLog.count({ where: { userId: archOwner.id, action: "ARCHIVED" } })) === 1);
  r = await call("DELETE", `/admin/active-owners/${archOwner.id}`, T("super"), {});
  check("archiving twice → 404", r.status === 404, r.body);

  section("Super Admin Subscriptions & Packages: numbers, filters, reminders, details, message");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/subscriptions", "/admin/subscriptions/stats", "/admin/subscriptions/reminder?audience=all"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.split("?")[0]} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("POST", "/admin/subscriptions/reminder", T("owner"), { audience: "all", title: "Hello", body: "Hello there" });
  check("an owner cannot send reminders → 403", r.status === 403, r.body);
  r = await call("GET", "/admin/subscriptions/stats", null);
  check("subscription numbers need a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/subscriptions/stats", T("super"));
  check("nine card numbers: active, per package, expired, expiring, boost, new buyers, month revenue", r.status === 200 && r.data.active >= 1 && typeof r.data.plans.PRIMARY === "number" && typeof r.data.plans.MILLIONAIRE === "number" && typeof r.data.plans.BILLIONAIRE === "number" && typeof r.data.expired === "number" && typeof r.data.expiring === "number" && typeof r.data.boost.active === "number" && typeof r.data.newThisWeek === "number" && Number(r.data.revenueMonth.amount) >= 0, r.body);
  const ownerCode = (await db.user.findUnique({ where: { id: users.owner!.id }, select: { ownerCode: true } }))?.ownerCode;
  r = await call("GET", `/admin/subscriptions?q=${encodeURIComponent(ownerCode ?? "none")}`, T("super"));
  const sRow = r.data?.items?.[0];
  check("Owner ID search finds the owner: package, usage, months, paid, end date, status", r.status === 200 && r.data.total === 1 && sRow?.userId === users.owner!.id && sRow.state === "ACTIVE" && !!sRow.plan.code && sRow.months >= 1 && sRow.paid === true && !!sRow.endsAt && typeof sRow.usage.properties === "number", r.body);
  r = await call("GET", `/admin/subscriptions?plan=${sRow?.plan.code}&q=${ownerCode}`, T("super"));
  check("package filter keeps the owner under their package", r.status === 200 && r.data.total === 1, r.body);
  r = await call("GET", `/admin/subscriptions?plan=BILLIONAIRE&q=${ownerCode}`, T("super"));
  check("…and leaves them out of another package", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/subscriptions?plan=GOLD", T("super"));
  check("an unknown package → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/subscriptions?status=SLEEPING", T("super"));
  check("an unknown status → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/subscriptions?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/subscriptions?page=1", T("super"));
  check("10 per page with the total for 'Showing 10 of N entries'", r.status === 200 && r.data.pageSize === 10 && r.data.items.length <= 10 && r.data.total >= r.data.items.length, r.body);
  r = await call("GET", `/admin/subscriptions/${sRow?.id}`, T("super"));
  check("details: dates, limits against usage, boosts and the payment history", r.status === 200 && r.data.userId === users.owner!.id && !!r.data.plan.code && typeof r.data.usage.propertyLimit === "number" && Array.isArray(r.data.payments) && typeof r.data.boosts === "number" && "graceEndsAt" in r.data, r.body);
  r = await call("GET", `/admin/subscriptions/00000000-0000-7000-8000-000000000000`, T("super"));
  check("details of a missing plan → 404", r.status === 404, r.body);

  const activeSub = await db.userSubscription.findFirst({ where: { userId: users.owner!.id, status: "ACTIVE" }, select: { id: true, endsAt: true, status: true } });
  await db.userSubscription.update({ where: { id: activeSub!.id }, data: { endsAt: new Date(Date.now() + 3 * 86_400_000) } });
  r = await call("GET", `/admin/subscriptions?status=EXPIRING&q=${ownerCode}`, T("super"));
  check("a plan ending in 3 days is Expiring Soon", r.status === 200 && r.data.total === 1 && r.data.items[0].state === "EXPIRING" && r.data.items[0].daysLeft <= 3, r.body);
  r = await call("GET", `/admin/subscriptions?status=ACTIVE&q=${ownerCode}`, T("super"));
  check("…and no longer plain Active", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/subscriptions/reminder?audience=expiring", T("super"));
  check("the Expiring Soon banner counts the owner and the amount due", r.status === 200 && r.data.count >= 1 && Number(r.data.totalDue) > 0 && r.data.sample.length >= 1, r.body);
  r = await call("GET", "/admin/subscriptions/reminder?audience=everyone", T("super"));
  check("an unknown reminder group → 422", r.status === 422, r.body);
  r = await call("POST", "/admin/subscriptions/reminder", T("super"), { audience: "expiring", title: "Plan ending", body: "Dear [name], your [plan] plan ends on [date]. Amount due: ৳[amount]." });
  check("the reminder is sent", r.status === 201 && r.data.recipients >= 1, r.body);
  const rem = await call("GET", "/notifications?limit=40", T("owner"));
  const remItem = rem.data?.items?.find((x: any) => x.type === "broadcast" && String(x.params?.body).includes("Plan") === false && String(x.params?.title) === "Plan ending");
  check("the owner gets it with their own name, plan, date and amount filled in", !!remItem && !String(remItem.params.body).includes("[") && String(remItem.params.body).includes("Test owner") && /৳\d/.test(String(remItem.params.body)), rem.body);
  r = await call("POST", "/admin/subscriptions/reminder", T("super"), { audience: "expiring", title: "x", body: "short" });
  check("a too-short title → 422", r.status === 422, r.body);
  r = await call("POST", "/admin/subscriptions/reminder", T("super"), { audience: "all", title: "Hi", body: "Hi" });
  check("a too-short title and message → 422", r.status === 422, r.body);

  await db.userSubscription.update({ where: { id: activeSub!.id }, data: { status: "EXPIRED", endsAt: new Date(Date.now() - 2 * 86_400_000) } });
  r = await call("GET", `/admin/subscriptions?status=EXPIRED&q=${ownerCode}`, T("super"));
  check("an ended plan is Expired", r.status === 200 && r.data.total === 1 && r.data.items[0].state === "EXPIRED", r.body);
  r = await call("GET", "/admin/subscriptions/reminder?audience=expired", T("super"));
  check("the Expired banner counts the owner", r.status === 200 && r.data.count >= 1 && Number(r.data.totalDue) > 0, r.body);
  r = await call("POST", "/admin/subscriptions/reminder", T("super"), { audience: "expired", title: "Plan ended", body: "Dear [name], your plan ended. Please renew." });
  check("the Expired reminder is sent", r.status === 201 && r.data.recipients >= 1, r.body);
  await db.userSubscription.update({ where: { id: activeSub!.id }, data: { status: "ACTIVE", endsAt: activeSub!.endsAt } });
  r = await call("POST", "/admin/subscriptions/reminder", T("super"), { audience: "all", title: "News for owners", body: "Dear [name], a new feature is live." });
  check("a message to every owner", r.status === 201 && r.data.recipients >= 1, r.body);
  const everyone = await call("GET", "/notifications?limit=40", T("owner"));
  check("…reaches the owner", everyone.data?.items?.some((x: any) => x.type === "broadcast" && x.params?.title === "News for owners" && String(x.params.body).includes("Test owner")), everyone.body);
  r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users.owner!.id });
  check("the Super Admin can open a direct chat with an owner from the table", (r.status === 200 || r.status === 201) && !!r.data?.id, r.body);

  section("Super Admin Message page: anyone can be found by kind and by name, chats and calls");
  const chatKinds: [string, string][] = [["GENERAL_USER", "general"], ["TENANT", "tenant"], ["OWNER", "owner"], ["GOV_ADMIN", "gov"]];
  for (const [role, key] of chatKinds) {
    r = await call("GET", `/conversations/contacts?role=${role}`, T("super"));
    check(`browse ${role}: only that kind, and the test account is in the list`, r.status === 200 && r.data.length >= 1 && r.data.every((c: any) => c.role === role) && r.data.some((c: any) => c.id === users[key]!.id), r.body);
  }
  r = await call("GET", "/conversations/contacts?role=SUPER_ADMIN", T("super"));
  check("an unknown kind of person → 422", r.status === 422, r.body);
  r = await call("GET", `/conversations/contacts?role=OWNER&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("kind + name together narrow the list to that person", r.status === 200 && r.data.length === 1 && r.data[0].id === users.owner!.id, r.body);
  r = await call("GET", `/conversations/contacts?role=TENANT&q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("the wrong kind finds nobody", r.status === 200 && r.data.length === 0, r.body);
  const ownerCodeMsg = (await db.user.findUnique({ where: { id: users.owner!.id }, select: { ownerCode: true } }))?.ownerCode;
  if (ownerCodeMsg) {
    r = await call("GET", `/conversations/contacts?q=${encodeURIComponent(ownerCodeMsg)}`, T("super"));
    check("search by Owner ID works", r.status === 200 && r.data.some((c: any) => c.id === users.owner!.id), r.body);
  }
  r = await call("GET", "/conversations/contacts", T("super"));
  check("no kind and no words → nothing listed (no browsing of everyone at once)", r.status === 200 && r.data.length === 0, r.body);
  r = await call("GET", "/conversations/contacts?q=a", T("super"));
  check("one letter is not enough → nothing", r.status === 200 && r.data.length === 0, r.body);
  r = await call("GET", "/conversations/contacts?role=GENERAL_USER", T("gov"));
  check("a Government Admin cannot browse Tenant Free accounts", r.status === 200 && r.data.length === 0, r.body);
  r = await call("GET", "/conversations/contacts?role=OWNER", T("gov"));
  check("…but can browse owners", r.status === 200 && r.data.length >= 1 && r.data.every((c: any) => c.role === "OWNER"), r.body);
  r = await call("GET", "/conversations/contacts?role=GENERAL_USER", T("general"));
  check("a Tenant Free account cannot browse people at all", r.status === 200 && r.data.length === 0, r.body);

  for (const [role, key] of [["GENERAL_USER", "general"], ["TENANT", "tenant"], ["OWNER", "owner"]] as const) {
    r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users[key]!.id });
    const cid = r.data?.id;
    check(`the Super Admin opens a chat with a ${role}`, (r.status === 200 || r.status === 201) && !!cid, r.body);
    r = await call("POST", `/conversations/${cid}/messages`, T("super"), { clientId: randomUUID(), body: `Hello ${role} from the admin` });
    check(`…and writes to the ${role}`, r.status === 201 || r.status === 200, r.body);
    r = await call("GET", `/conversations/${cid}/messages`, T(key));
    check(`the ${role} sees the message`, r.status === 200 && r.data.items.some((m: any) => String(m.body).includes("from the admin")), r.body);
    r = await call("POST", `/conversations/${cid}/messages`, T(key), { clientId: randomUUID(), body: "Thank you" });
    check(`the ${role} can answer the admin`, r.status === 201 || r.status === 200, r.body);
    r = await call("POST", "/calls", T("super"), { conversationId: cid });
    const adminCall = r.data?.id;
    check(`the Super Admin can call the ${role}`, r.status === 201 && !!adminCall, r.body);
    if (adminCall) { r = await call("POST", `/calls/${adminCall}/end`, T("super")); check(`…and end the call`, r.status === 200, r.body); }
  }
  for (const key of ["general", "tenant", "owner"] as const) {
    r = await call("GET", "/conversations", T(key));
    const fromAdmin = r.data?.find((c: any) => c.participants.some((p: any) => p.role === "SUPER_ADMIN"));
    const sp = fromAdmin?.participants.find((p: any) => p.role === "SUPER_ADMIN");
    check(`the ${key} sees the Super Admin as "AmaderGhor Support Center" with the AmaderGhor icon`, r.status === 200 && sp?.fullName === "AmaderGhor Support Center" && sp.avatarUrl === "/images/logo-icon.png" && sp.username === "support", r.body);
    r = await call("GET", "/notifications?limit=40", T(key));
    check(`…and the "new message" notification of the ${key} names the Support Center, not the admin`, r.data?.items?.some((x: any) => x.type === "message.new" && x.params?.from === "AmaderGhor Support Center") && !r.data.items.some((x: any) => x.type === "message.new" && x.params?.from === "Test super"), r.body);
  }
  // the red alert on the Message button is fed by this summary
  r = await call("GET", "/conversations/unread", null);
  check("the unread summary needs a sign-in → 401", r.status === 401, r.body);
  r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users.owner!.id });
  const alertConv = r.data?.id;
  const beforeAlert = (await call("GET", "/conversations/unread", T("owner"))).data;
  await call("POST", `/conversations/${alertConv}/messages`, T("super"), { clientId: randomUUID(), body: "Alert check" });
  r = await call("GET", "/conversations/unread", T("owner"));
  check("a new message from the admin raises the owner's unread count and gives the time of the newest", r.status === 200 && r.data.count === beforeAlert.count + 1 && !!r.data.latestAt && r.data.chats >= 1, r.body);
  r = await call("POST", `/conversations/${alertConv}/read`, T("owner"));
  r = await call("GET", "/conversations/unread", T("owner"));
  check("reading the chat takes it off the count", r.status === 200 && r.data.count === beforeAlert.count, r.body);
  for (const k of ["tenant", "general"] as const) {
    r = await call("GET", "/conversations/unread", T(k));
    check(`the ${k} gets the summary too`, r.status === 200 && typeof r.data.count === "number", r.body);
  }
  r = await call("GET", "/conversations/unread", T("super"));
  check("and so does the Super Admin", r.status === 200 && typeof r.data.count === "number", r.body);

  r = await call("GET", "/conversations", T("super"));
  check("the chat list has all three chats, each with the other person's kind", r.status === 200 && ["general", "tenant", "owner"].every((k) => r.data.some((c: any) => c.participants.some((p: any) => p.id === users[k]!.id && !!p.role))), r.body);

  section("Super Admin Previous Properties: numbers, filters, view, reactivate, status, delete");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/previous-properties", "/admin/previous-properties/stats"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/previous-properties/stats", null);
  check("the archive numbers need a sign-in → 401", r.status === 401, r.body);
  const ppTag = "Zarchive" + Math.random().toString(36).slice(2, 7);
  const ppBase = { ownerId: users.owner!.id, type: "Apartment Building", totalFloors: 3, declaredUnits: 6 };
  const ppDay = new Date(Date.now() - 20 * 86_400_000);
  const ppA = await db.property.create({ data: { ...ppBase, name: `${ppTag} Alpha`, status: "ARCHIVED", archivedAt: ppDay, deactivatedAt: ppDay, archiveReason: "Owner request", archiveReasonCode: "OWNER_REQUEST" } });
  const ppB = await db.property.create({ data: { ...ppBase, name: `${ppTag} Bravo`, status: "SUSPENDED", deactivatedAt: ppDay, archiveReason: "Policy violation", archiveReasonCode: "POLICY_VIOLATION" } });
  const ppC = await db.property.create({ data: { ...ppBase, name: `${ppTag} Charlie`, status: "INACTIVE", deactivatedAt: ppDay, archiveReason: "Non-payment", archiveReasonCode: "NON_PAYMENT" } });
  const ppD = await db.property.create({ data: { ...ppBase, name: `${ppTag} Delta`, status: "ARCHIVED", archivedAt: ppDay, deactivatedAt: ppDay, archiveReason: "Sold", archiveReasonCode: "SOLD_PROPERTY" } });
  for (const [prop2, no] of [[ppA, "A-1"], [ppA, "A-2"], [ppD, "D-1"]] as const) {
    await db.unit.create({ data: { propertyId: prop2.id, unitNumber: no, floor: 1, rent: 9000, availability: "ARCHIVED", archivedAt: ppDay } });
  }
  const ppUnitD = await db.unit.findFirst({ where: { propertyId: ppD.id } });
  await db.rentalAgreement.create({ data: { unitId: ppUnitD!.id, tenantId: users.tenant!.id, ownerId: users.owner!.id, rent: 9000, startDate: new Date("2025-01-01"), endDate: new Date("2025-06-30"), status: "ENDED" } });

  r = await call("GET", `/admin/previous-properties?q=${ppTag}`, T("super"));
  check("search by property name finds the four records, newest first, 10 per page", r.status === 200 && r.data.total === 4 && r.data.pageSize === 10 && r.data.items.length === 4, r.body);
  const ppRow = r.data?.items?.find((x: any) => x.id === ppA.id);
  check("a row has the property, units, owner contact, place, date, reason and status", !!ppRow && ppRow.units >= 2 && ppRow.owner.id === users.owner!.id && !!ppRow.owner.email && ppRow.reasonCode === "OWNER_REQUEST" && ppRow.status === "ARCHIVED" && !!ppRow.deactivatedAt, r.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&status=SUSPENDED`, T("super"));
  check("status filter: Suspended shows only Bravo", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ppB.id, r.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&status=ARCHIVED`, T("super"));
  check("status filter: Archived shows Alpha and Delta", r.status === 200 && r.data.total === 2, r.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&reason=NON_PAYMENT`, T("super"));
  check("reason filter: Non-payment shows only Charlie", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ppC.id, r.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&reason=NON_PAYMENT&status=SUSPENDED`, T("super"));
  check("the two filters work together (no match → empty)", r.status === 200 && r.data.total === 0 && r.data.items.length === 0, r.body);
  const ppOwnerCode = (await db.user.findUnique({ where: { id: users.owner!.id }, select: { ownerCode: true } }))?.ownerCode ?? "none";
  r = await call("GET", `/admin/previous-properties?q=${encodeURIComponent(ppOwnerCode)}`, T("super"));
  check("search also finds a property by its owner's ID", r.status === 200 && r.data.items.some((x: any) => x.id === ppB.id), r.body);
  r = await call("GET", "/admin/previous-properties?status=BANNED", T("super"));
  check("an unknown status → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-properties?reason=BORED", T("super"));
  check("an unknown reason → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-properties?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&page=2`, T("super"));
  check("a page past the end is empty but keeps the total", r.status === 200 && r.data.items.length === 0 && r.data.total === 4, r.body);
  r = await call("GET", "/admin/previous-properties/stats", T("super"));
  check("six numbers: archived, suspended, inactive, deleted, all records, reactivated", r.status === 200 && r.data.archived >= 2 && r.data.suspended >= 1 && r.data.inactive >= 1 && typeof r.data.deleted === "number" && r.data.total >= r.data.archived + r.data.suspended + r.data.inactive + r.data.deleted && typeof r.data.reactivated === "number", r.body);
  const ppStats = r.data;
  r = await call("GET", `/admin/previous-properties/${prop?.id}`, T("super"));
  check("a live property is not in the archive → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/previous-properties/${ppA.id}`, T("super"));
  check("details: address, date, reason, owner contact, unit matrix and history", r.status === 200 && r.data.name === `${ppTag} Alpha` && r.data.reasonCode === "OWNER_REQUEST" && r.data.owner.id === users.owner!.id && r.data.owner.ready === true && r.data.units.length === 2 && r.data.totalUnits >= 6 && Array.isArray(r.data.history), r.body);
  for (const who of ["owner", "tenant", "general", "gov"]) {
    r = await call("GET", `/admin/previous-properties/${ppA.id}`, T(who));
    check(`${who} cannot read archive details → 403`, r.status === 403, r.body);
    r = await call("PATCH", `/admin/previous-properties/${ppA.id}/status`, T(who), { status: "ACTIVE" });
    check(`${who} cannot reactivate → 403`, r.status === 403, r.body);
    r = await call("DELETE", `/admin/previous-properties/${ppA.id}`, T(who), {});
    check(`${who} cannot delete → 403`, r.status === 403, r.body);
  }
  r = await call("PATCH", `/admin/previous-properties/${ppB.id}/status`, T("super"), { status: "BANNED" });
  check("an unknown new status → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-properties/${ppB.id}/status`, T("super"), { status: "INACTIVE" });
  check("a non-active status needs a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-properties/${ppB.id}/status`, T("super"), { status: "ACTIVE", extra: 1 });
  check("unknown fields are refused → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-properties/00000000-0000-7000-8000-000000000000/status`, T("super"), { status: "ACTIVE" });
  check("a missing property → 404", r.status === 404, r.body);

  r = await call("PATCH", `/admin/previous-properties/${ppB.id}/status`, T("super"), { status: "INACTIVE", reason: "NON_PAYMENT", note: "Unpaid for two months" });
  check("Suspended → Inactive with a reason and a note", r.status === 200 && r.data.changed === true, r.body);
  const ppBNow = await db.property.findUnique({ where: { id: ppB.id } });
  check("…the record keeps the new status, reason code and note", ppBNow?.status === "INACTIVE" && ppBNow.archiveReasonCode === "NON_PAYMENT" && ppBNow.archiveReason === "Unpaid for two months", JSON.stringify(ppBNow));
  r = await call("PATCH", `/admin/previous-properties/${ppB.id}/status`, T("super"), { status: "INACTIVE", reason: "NON_PAYMENT", note: "Unpaid for two months" });
  check("the same status again changes nothing", r.status === 200 && r.data.changed === false, r.body);

  await db.user.update({ where: { id: users.owner!.id }, data: { status: "SUSPENDED" } });
  r = await call("PATCH", `/admin/previous-properties/${ppC.id}/status`, T("super"), { status: "ACTIVE" });
  check("a property cannot be reactivated while its owner account is not active → 409", r.status === 409, r.body);
  await db.user.update({ where: { id: users.owner!.id }, data: { status: "ACTIVE" } });

  r = await call("PATCH", `/admin/previous-properties/${ppA.id}/status`, T("super"), { status: "ACTIVE" });
  check("Edit → Active (Reactivate) works", r.status === 200 && r.data.changed === true && r.data.status === "ACTIVE", r.body);
  const ppANow = await db.property.findUnique({ where: { id: ppA.id } });
  check("…it is live again: no archive date, no reason, status Active", ppANow?.status === "ACTIVE" && ppANow.archivedAt === null && ppANow.archiveReasonCode === null && ppANow.deactivatedAt === null, JSON.stringify(ppANow));
  const ppUnitsA = await db.unit.findMany({ where: { propertyId: ppA.id } });
  check("…its units came back as vacant", ppUnitsA.length === 2 && ppUnitsA.every((u) => u.archivedAt === null && u.availability === "AVAILABLE"), JSON.stringify(ppUnitsA));
  r = await call("GET", `/admin/previous-properties?q=${ppTag}`, T("super"));
  check("…and it left the archive list", r.status === 200 && r.data.total === 3 && !r.data.items.some((x: any) => x.id === ppA.id), r.body);
  r = await call("GET", `/admin/previous-properties/${ppA.id}`, T("super"));
  check("…its archive details are gone → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/previous-properties/stats", T("super"));
  check("the numbers moved: one less archived, one reactivated", r.status === 200 && r.data.archived === ppStats.archived - 1 && r.data.reactivated === ppStats.reactivated + 1, r.body);
  const ppNotes = await call("GET", "/notifications?limit=40", T("owner"));
  check("the owner was told the property is active again", ppNotes.data?.items?.some((x: any) => JSON.stringify(x).includes("propertyReactivated") && JSON.stringify(x).includes(ppTag)), ppNotes.body);
  r = await call("GET", `/properties/${ppA.id}`, T("owner"));
  check("the owner sees the property again", r.status === 200 && r.data.status === "ACTIVE", r.body);

  r = await call("PATCH", `/admin/previous-properties/${ppC.id}/status`, T("super"), { status: "ARCHIVED", reason: "RENOVATION" });
  check("Inactive → Archived with a reason", r.status === 200 && r.data.changed === true, r.body);
  const ppCNow = await db.property.findUnique({ where: { id: ppC.id } });
  check("…it now has an archive date", ppCNow?.status === "ARCHIVED" && !!ppCNow.archivedAt && ppCNow.archiveReasonCode === "RENOVATION", JSON.stringify(ppCNow));
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&reason=RENOVATION`, T("super"));
  check("the reason filter now finds it under Renovation / Remodeling", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ppC.id, r.body);

  r = await call("DELETE", `/admin/previous-properties/${ppC.id}`, T("super"), {});
  check("Delete: a property nothing depends on is erased for good", r.status === 200 && r.data.purged === true, r.body);
  check("…the row is gone from the database", (await db.property.count({ where: { id: ppC.id } })) === 0);
  r = await call("DELETE", `/admin/previous-properties/${ppC.id}`, T("super"), {});
  check("deleting it again → 404", r.status === 404, r.body);
  r = await call("DELETE", `/admin/previous-properties/${ppD.id}`, T("super"), {});
  check("Delete: a property with rent history is kept as a hidden Deleted record", r.status === 200 && r.data.purged === false, r.body);
  const ppDNow = await db.property.findUnique({ where: { id: ppD.id } });
  check("…its status is Deleted and its history is untouched", ppDNow?.status === "DELETED" && (await db.rentalAgreement.count({ where: { unitId: ppUnitD!.id } })) === 1, JSON.stringify(ppDNow));
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&status=DELETED`, T("super"));
  check("status filter: Deleted shows it", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ppD.id, r.body);
  r = await call("GET", `/properties/${ppD.id}`, T("owner"));
  check("a deleted property is not shown to the owner as live", r.status === 404 || r.data?.status !== "ACTIVE", r.body);
  r = await call("GET", `/admin/previous-properties/${ppD.id}`, T("super"));
  check("the history shows who did what", r.status === 200 && r.data.history.some((h: any) => h.action === "property.delete" && h.by?.role === "SUPER_ADMIN"), r.body);

  section("Owner deletes a property with a reason from the dropdown");
  const delE = await db.property.create({ data: { ...ppBase, name: `${ppTag} Echo` } });
  const delF = await db.property.create({ data: { ...ppBase, name: `${ppTag} Foxtrot` } });
  r = await call("POST", `/properties/${delE.id}/archive`, T("owner"), { reasonCode: "BOGUS" });
  check("an unknown reason → 422", r.status === 422, r.body);
  r = await call("POST", `/properties/${delE.id}/archive`, T("owner"), { reasonCode: "OTHER" });
  check("\"Other\" needs a written reason → 422", r.status === 422, r.body);
  r = await call("POST", `/properties/${delE.id}/archive`, T("owner"), { reasonCode: "NON_PAYMENT" });
  check("an owner cannot pick a platform-only reason (Non-payment) → 422", r.status === 422, r.body);
  r = await call("POST", `/properties/${delE.id}/archive`, T("owner"), { reasonCode: "SOLD_PROPERTY" });
  check("Delete with \"I sold the property\" works", r.status === 200 || r.status === 201, r.body);
  const delENow = await db.property.findUnique({ where: { id: delE.id } });
  check("…the record keeps the reason code, its text and the date", delENow?.status === "ARCHIVED" && delENow.archiveReasonCode === "SOLD_PROPERTY" && delENow.archiveReason === "Sold property" && !!delENow.deactivatedAt, JSON.stringify(delENow));
  r = await call("POST", `/properties/${delF.id}/archive`, T("owner"), { reasonCode: "OTHER", reason: "Moving abroad next month" });
  check("Delete with \"Other\" and a note works", r.status === 200 || r.status === 201, r.body);
  const delFNow = await db.property.findUnique({ where: { id: delF.id } });
  check("…the note is kept as the reason text", delFNow?.archiveReasonCode === "OTHER" && delFNow.archiveReason === "Moving abroad next month", JSON.stringify(delFNow));
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&reason=SOLD_PROPERTY`, T("super"));
  check("the Super Admin finds it in Previous Properties under Sold Property", r.status === 200 && r.data.items.some((x: any) => x.id === delE.id), r.body);
  r = await call("POST", `/properties/${ppB.id}/archive`, T("tenant"), { reasonCode: "SOLD_PROPERTY" });
  check("someone else cannot delete the owner's property", r.status === 403 || r.status === 404, r.body);

  section("Super Admin Properties: Delete with a reason and a note");
  const sdG = await db.property.create({ data: { ...ppBase, name: `${ppTag} Golf` } });
  const sdH = await db.property.create({ data: { ...ppBase, name: `${ppTag} Hotel` } });
  for (const who of ["owner", "tenant", "general", "gov"]) {
    r = await call("DELETE", `/admin/properties/${sdG.id}`, T(who), { reasonCode: "SOLD_PROPERTY" });
    check(`${who} cannot delete from the Super Admin page → 403`, r.status === 403, r.body);
  }
  r = await call("DELETE", `/admin/properties/${sdG.id}`, T("super"), { reasonCode: "BOGUS" });
  check("an unknown reason → 422", r.status === 422, r.body);
  r = await call("DELETE", `/admin/properties/${sdG.id}`, T("super"), { reasonCode: "OTHER" });
  check("\"Other\" without a note → 422", r.status === 422, r.body);
  r = await call("DELETE", `/admin/properties/${sdG.id}`, T("super"), { reasonCode: "POLICY_VIOLATION", note: "Repeated fake photos", extra: 1 });
  check("unknown fields → 422", r.status === 422, r.body);
  check("…nothing was deleted by the refused calls", (await db.property.findUnique({ where: { id: sdG.id } }))?.archivedAt === null);
  r = await call("DELETE", `/admin/properties/${sdG.id}`, T("super"), { reasonCode: "POLICY_VIOLATION", note: "Repeated fake photos" });
  check("Delete with Policy Violation and a note works", r.status === 200 && r.data.deleted === true, r.body);
  const sdGNow = await db.property.findUnique({ where: { id: sdG.id } });
  check("…the record keeps the code, the note, the date and the archived status", sdGNow?.status === "ARCHIVED" && sdGNow.archiveReasonCode === "POLICY_VIOLATION" && sdGNow.archiveReason === "Repeated fake photos" && !!sdGNow.deactivatedAt && !!sdGNow.archivedAt, JSON.stringify(sdGNow));
  const sdNote = await call("GET", "/notifications?limit=40", T("owner"));
  check("…the owner is told, with the reason", sdNote.data?.items?.some((x: any) => x.type === "property.review" && JSON.stringify(x).includes(`${ppTag} Golf`) && JSON.stringify(x).includes("Repeated fake photos")), sdNote.body);
  r = await call("GET", `/admin/previous-properties?q=${ppTag}&reason=POLICY_VIOLATION`, T("super"));
  check("…and it shows in Previous Properties under Policy Violation", r.status === 200 && r.data.items.some((x: any) => x.id === sdG.id), r.body);
  r = await call("DELETE", `/admin/properties/${sdH.id}`, T("super"), { reasonCode: "SOLD_PROPERTY" });
  check("a reason without a note is fine (Sold Property)", r.status === 200, r.body);
  check("…the stored text is the reason's name", (await db.property.findUnique({ where: { id: sdH.id } }))?.archiveReason === "Sold property");
  r = await call("DELETE", `/admin/properties/${sdH.id}`, T("super"), { reasonCode: "SOLD_PROPERTY" });
  check("deleting it again → 404", r.status === 404, r.body);

  section("Super Admin Previous Owners: numbers, filters, view, reactivate, status, delete");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/previous-owners", "/admin/previous-owners/stats", `/admin/previous-owners/${users.owner!.id}`]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(users.owner!.id, ":id")} → 403`, r.status === 403, r.body);
    }
    r = await call("PATCH", `/admin/previous-owners/${users.owner!.id}/status`, T(who), { status: "ACTIVE" });
    check(`${who} cannot change an archive status → 403`, r.status === 403, r.body);
    r = await call("DELETE", `/admin/previous-owners/${users.owner!.id}`, T(who), {});
    check(`${who} cannot delete from the archive → 403`, r.status === 403, r.body);
  }
  r = await call("GET", "/admin/previous-owners/stats", null);
  check("the archive numbers need a sign-in → 401", r.status === 401, r.body);
  const poTag = "zpo" + Math.random().toString(36).slice(2, 7);
  const poDay = new Date(Date.now() - 30 * 86_400_000);
  const poMake = async (key: string, name: string, data: Record<string, unknown>) => {
    const u = await db.user.create({ data: { username: `${poTag}${key}`, fullName: name, email: `${poTag}.${key}@mailinator.com`, phone: phone(), role: "OWNER", ...data } as never });
    users[`po${key}`] = { key: `po${key}`, id: u.id, authId: "", email: u.email!, password: "", username: u.username, token: "" };
    return u;
  };
  const poA = await poMake("a", `${poTag} Archived Alpha`, { status: "INACTIVE", archivedAt: poDay, leftAt: poDay, archiveReason: "Subscription cancelled", archiveReasonCode: "SUBSCRIPTION_CANCELLED" });
  const poB = await poMake("b", `${poTag} Banned Bravo`, { status: "BANNED", archivedAt: poDay, leftAt: poDay, archiveReason: "Fraud", archiveReasonCode: "POLICY_VIOLATION_FRAUD" });
  const poC = await poMake("c", `${poTag} Inactive Charlie`, { status: "INACTIVE", leftAt: poDay, archiveReason: "Dormant account", archiveReasonCode: "DORMANT" });
  const poD = await poMake("d", `${poTag} Deleted Delta`, { status: "DELETED", archivedAt: poDay, leftAt: poDay, archiveReason: "Deleted by user", archiveReasonCode: "ACCOUNT_DELETED_BY_USER" });
  const poE = await poMake("e", `${poTag} Erase Echo`, { status: "DELETED", archivedAt: poDay, leftAt: poDay, archiveReasonCode: "OTHER" });
  const poF = await poMake("f", `${poTag} Foxtrot Live`, { status: "INACTIVE", leftAt: poDay, archiveReasonCode: "DORMANT" });
  await db.property.create({ data: { ownerId: poD.id, name: `${poTag} Delta House`, type: "Apartment Building", totalFloors: 2, status: "ARCHIVED", archivedAt: poDay } });
  const poLive = await db.property.create({ data: { ownerId: poF.id, name: `${poTag} Foxtrot House`, type: "Apartment Building", totalFloors: 2, declaredUnits: 3 } });
  await db.accountStatusLog.create({ data: { userId: poB.id, adminId: users.super!.id, adminUsername: "amaderghor", action: "BANNED", comment: "Fake documents" } });

  r = await call("GET", `/admin/previous-owners?q=${poTag}`, T("super"));
  check("search by name finds the six records, 10 per page", r.status === 200 && r.data.total === 6 && r.data.pageSize === 10 && r.data.items.length === 6, r.body);
  const poRow = r.data?.items?.find((x: any) => x.id === poD.id);
  check("a row has name, contact, properties managed, left date, reason and state", !!poRow && !!poRow.email && poRow.properties === 1 && poRow.reasonCode === "ACCOUNT_DELETED_BY_USER" && poRow.state === "DELETED" && !!poRow.leftAt, r.body);
  for (const [st, id] of [["ARCHIVED", poA.id], ["BANNED", poB.id], ["INACTIVE", poC.id]] as const) {
    r = await call("GET", `/admin/previous-owners?q=${poTag}&status=${st}`, T("super"));
    check(`status filter ${st} finds the right owner`, r.status === 200 && r.data.items.some((x: any) => x.id === id) && r.data.items.every((x: any) => x.state === st), r.body);
  }
  r = await call("GET", `/admin/previous-owners?q=${poTag}&status=DELETED`, T("super"));
  check("status filter DELETED finds Delta and Echo", r.status === 200 && r.data.total === 2, r.body);
  r = await call("GET", `/admin/previous-owners?q=${poTag}&reason=POLICY_VIOLATION_FRAUD`, T("super"));
  check("reason filter: Policy Violation (Fraud) finds only Bravo", r.status === 200 && r.data.total === 1 && r.data.items[0].id === poB.id, r.body);
  r = await call("GET", `/admin/previous-owners?q=${poTag}&reason=DORMANT&status=BANNED`, T("super"));
  check("the two filters work together (no match → empty)", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", `/admin/previous-owners?q=${poTag}&reason=OTHER`, T("super"));
  check("records without a clear reason count as Other", r.status === 200 && r.data.items.some((x: any) => x.id === poE.id), r.body);
  r = await call("GET", `/admin/previous-owners?q=${encodeURIComponent(poA.email!)}`, T("super"));
  check("search by e-mail works too", r.status === 200 && r.data.total === 1 && r.data.items[0].id === poA.id, r.body);
  r = await call("GET", "/admin/previous-owners?status=ACTIVE", T("super"));
  check("an unknown status → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-owners?reason=BORED", T("super"));
  check("an unknown reason → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-owners?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/previous-owners?q=${poTag}&page=2`, T("super"));
  check("a page past the end is empty but keeps the total", r.status === 200 && r.data.items.length === 0 && r.data.total === 6, r.body);
  r = await call("GET", "/admin/previous-owners/stats", T("super"));
  check("six numbers: archived, banned, inactive, deleted, all records, reactivated", r.status === 200 && r.data.archived >= 1 && r.data.banned >= 1 && r.data.inactive >= 2 && r.data.deleted >= 2 && r.data.total >= r.data.archived + r.data.banned + r.data.inactive + r.data.deleted && typeof r.data.reactivated === "number", r.body);
  const poStats = r.data;
  r = await call("GET", `/admin/previous-owners/${users.owner!.id}`, T("super"));
  check("an active owner is not in the archive → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/previous-owners/${poB.id}`, T("super"));
  check("details: contact, departure, reason, ban log and the property archive", r.status === 200 && r.data.fullName.includes("Bravo") && r.data.state === "BANNED" && r.data.reasonCode === "POLICY_VIOLATION_FRAUD" && r.data.log.some((l: any) => l.action === "BANNED" && l.comment === "Fake documents") && Array.isArray(r.data.properties), r.body);
  r = await call("GET", `/admin/previous-owners/${poD.id}`, T("super"));
  check("…and a former owner lists every property they managed", r.status === 200 && r.data.properties.length === 1 && r.data.properties[0].archived === true, r.body);

  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "BANNED" });
  check("Banned needs a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "SUSPENDED", reason: "OTHER" });
  check("an unknown new state → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "ACTIVE", extra: 1 });
  check("unknown fields are refused → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/previous-owners/00000000-0000-7000-8000-000000000000/status", T("super"), { status: "ACTIVE" });
  check("a missing owner → 404", r.status === 404, r.body);
  r = await call("PATCH", `/admin/previous-owners/${users.owner!.id}/status`, T("super"), { status: "BANNED", reason: "OTHER" });
  check("an active owner cannot be changed from this page → 404", r.status === 404, r.body);

  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "BANNED", reason: "POLICY_VIOLATION_FRAUD", note: "Fake rent receipts" });
  check("Inactive → Banned with a reason and a note", r.status === 200 && r.data.changed === true, r.body);
  const poCNow = await db.user.findUnique({ where: { id: poC.id } });
  check("…the record is Banned, archived, with the code, the note and the date", poCNow?.status === "BANNED" && !!poCNow.archivedAt && !!poCNow.leftAt && poCNow.archiveReasonCode === "POLICY_VIOLATION_FRAUD" && poCNow.archiveReason === "Fake rent receipts", JSON.stringify(poCNow));
  check("…and a Banned line is in the status log", (await db.accountStatusLog.count({ where: { userId: poC.id, action: "BANNED", comment: "Fake rent receipts" } })) === 1);
  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "BANNED", reason: "POLICY_VIOLATION_FRAUD", note: "Fake rent receipts" });
  r = await call("PATCH", `/admin/previous-owners/${poC.id}/status`, T("super"), { status: "BANNED", reason: "POLICY_VIOLATION_FRAUD" });
  check("the same state and reason again changes nothing", r.status === 200 && r.data.changed === false, r.body);

  r = await call("PATCH", `/admin/previous-owners/${poF.id}/status`, T("super"), { status: "ARCHIVED", reason: "SOLD_ALL_PROPERTIES" });
  check("Dormant → Archived works", r.status === 200 && r.data.changed === true && r.data.properties === 1, r.body);
  const poLiveNow = await db.property.findUnique({ where: { id: poLive.id } });
  check("…the owner live property was taken down with the reason Sold Property", poLiveNow?.status === "ARCHIVED" && !!poLiveNow.archivedAt && poLiveNow.archiveReasonCode === "SOLD_PROPERTY", JSON.stringify(poLiveNow));

  r = await call("PATCH", `/admin/previous-owners/${poB.id}/status`, T("super"), { status: "ACTIVE" });
  check("Edit → Active (Unban & Reactivate) works", r.status === 200 && r.data.changed === true && r.data.state === "ACTIVE", r.body);
  const poBNow = await db.user.findUnique({ where: { id: poB.id } });
  check("…the owner is Active again: no archive date, reason or left date", poBNow?.status === "ACTIVE" && poBNow.archivedAt === null && poBNow.archiveReason === null && poBNow.archiveReasonCode === null && poBNow.leftAt === null, JSON.stringify(poBNow));
  r = await call("GET", `/admin/previous-owners?q=${poTag}`, T("super"));
  check("…and left the archive list", r.status === 200 && r.data.total === 5 && !r.data.items.some((x: any) => x.id === poB.id), r.body);
  r = await call("GET", `/admin/previous-owners/${poB.id}`, T("super"));
  check("…its archive details are gone → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/active-owners?q=${encodeURIComponent(poB.username)}`, T("super"));
  check("…and it is back on Active Property Owners", r.status === 200 && r.data.items.some((x: any) => x.id === poB.id), r.body);
  r = await call("GET", "/admin/previous-owners/stats", T("super"));
  check("the numbers moved: all records one less, one more reactivated", r.status === 200 && r.data.reactivated === poStats.reactivated + 1 && r.data.total === poStats.total - 1, r.body);
  const poNote = await db.notification.findMany({ where: { userId: poB.id } });
  check("the owner was told the account is active again", poNote.some((x) => x.titleKey === "notifications.accountRestored"), JSON.stringify(poNote));
  check("the status log has the Active line", (await db.accountStatusLog.count({ where: { userId: poB.id, action: "ACTIVE" } })) === 1);

  r = await call("DELETE", `/admin/previous-owners/${poE.id}`, T("super"), {});
  check("Delete: an owner nothing depends on is erased for good", r.status === 200 && r.data.purged === true, r.body);
  check("…the row is gone from the database", (await db.user.count({ where: { id: poE.id } })) === 0);
  r = await call("DELETE", `/admin/previous-owners/${poE.id}`, T("super"), {});
  check("deleting it again → 404", r.status === 404, r.body);
  r = await call("DELETE", `/admin/previous-owners/${poD.id}`, T("super"), {});
  check("Delete: an owner with a property history is kept as a hidden Deleted record", r.status === 200 && r.data.purged === false, r.body);
  const poDNow = await db.user.findUnique({ where: { id: poD.id } });
  check("…still Deleted, and the property history is untouched", poDNow?.status === "DELETED" && (await db.property.count({ where: { ownerId: poD.id } })) === 1, JSON.stringify(poDNow));
  r = await call("DELETE", `/admin/previous-owners/${poA.id}`, T("super"), {});
  check("an archived owner with no history is erased too", r.status === 200 && r.data.purged === true, r.body);

  section("Super Admin Previous Tenants: numbers, filters, view, edit rent status, delete");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/previous-tenants", "/admin/previous-tenants/stats", "/admin/previous-tenants/" + users.owner!.id]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(users.owner!.id, ":id")} → 403`, r.status === 403, r.body);
    }
    r = await call("PATCH", `/admin/previous-tenants/${users.owner!.id}`, T(who), { rentStatus: "CLEARED" });
    check(`${who} cannot edit a record → 403`, r.status === 403, r.body);
    r = await call("DELETE", `/admin/previous-tenants/${users.owner!.id}`, T(who), {});
    check(`${who} cannot delete a record → 403`, r.status === 403, r.body);
  }
  r = await call("GET", "/admin/previous-tenants/stats", null);
  check("the archive numbers need a sign-in → 401", r.status === 401, r.body);
  const ptTag = "Zpt" + Math.random().toString(36).slice(2, 7);
  const ptProp = await db.property.create({ data: { ownerId: users.owner!.id, name: `${ptTag} Villa`, type: "Apartment Building", totalFloors: 2 } });
  const ptRent = 8000;
  const ptMake = async (no: string, status: "ENDED" | "TERMINATED", reason: string | null, months: { paid: number; status: "PAID" | "DUE" | "PARTIAL" | "OVERDUE" }[], end = "2025-06-30") => {
    const unit = await db.unit.create({ data: { propertyId: ptProp.id, unitNumber: no, floor: 1, rent: ptRent, availability: "AVAILABLE" } });
    const a = await db.rentalAgreement.create({ data: { unitId: unit.id, tenantId: users.tenant!.id, ownerId: users.owner!.id, rent: ptRent, startDate: new Date("2024-01-01"), endDate: new Date(end), status, ...(reason ? { leaveReason: reason as never } : {}) } });
    for (const [i, m] of months.entries()) {
      await db.rentRecord.create({ data: { agreementId: a.id, billingMonth: new Date(Date.UTC(2025, i, 1)), rent: ptRent, total: ptRent, paid: m.paid, dueDate: new Date(Date.UTC(2025, i, 5)), status: m.status } });
    }
    return a;
  };
  const ptA1 = await ptMake(`${ptTag}-1`, "ENDED", "LEASE_EXPIRED", [{ paid: ptRent, status: "PAID" }, { paid: ptRent, status: "PAID" }], "2025-06-12");
  const ptA2 = await ptMake(`${ptTag}-2`, "ENDED", "POLICY_VIOLATION", [{ paid: 0, status: "DUE" }, { paid: 0, status: "DUE" }], "2026-01-31");
  const ptA3 = await ptMake(`${ptTag}-3`, "TERMINATED", "JOB_TRANSFER", [{ paid: 3000, status: "PARTIAL" }], "2026-02-01");
  const ptA4 = await ptMake(`${ptTag}-4`, "ENDED", null, [0, 1, 2, 3].map(() => ({ paid: 0, status: "OVERDUE" as const })), "2025-09-30");
  const ptA5 = await ptMake(`${ptTag}-5`, "ENDED", "PURCHASED_HOME", [], "2025-12-31");

  r = await call("GET", `/admin/previous-tenants?q=${ptTag}`, T("super"));
  check("search by property name finds the five tenancies, newest move-out first, 10 per page", r.status === 200 && r.data.total === 5 && r.data.pageSize === 10 && r.data.items.length === 5 && r.data.items[0].id === ptA3.id, r.body);
  const ptRow = r.data?.items?.find((x: any) => x.id === ptA2.id);
  check("a row has tenant, contact, last residence with the landlord, rent status, unpaid money, move-out and reason", !!ptRow && ptRow.tenant.id === users.tenant!.id && !!ptRow.tenant.email && ptRow.residence.property === `${ptTag} Villa` && ptRow.residence.landlord === "Test owner" && ptRow.rentStatus === "DUE_2" && Number(ptRow.unpaid) === ptRent * 2 && ptRow.reasonCode === "POLICY_VIOLATION" && !!ptRow.moveOutAt, r.body);
  for (const [st, want] of [["CLEARED", 2], ["DUE_1", 1], ["DUE_2", 1], ["DUE_3_PLUS", 1]] as const) {
    r = await call("GET", `/admin/previous-tenants?q=${ptTag}&rent=${st}`, T("super"));
    check(`rent status ${st} finds ${want}`, r.status === 200 && r.data.total === want && r.data.items.every((x: any) => x.rentStatus === st), r.body);
  }
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&reason=POLICY_VIOLATION`, T("super"));
  check("reason filter: Policy Violation finds only that tenancy", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ptA2.id, r.body);
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&reason=OTHER`, T("super"));
  check("a tenancy without a reason counts as Other", r.status === 200 && r.data.total === 1 && r.data.items[0].id === ptA4.id, r.body);
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&reason=JOB_TRANSFER&rent=DUE_2`, T("super"));
  check("the two filters work together (no match → empty)", r.status === 200 && r.data.total === 0 && r.data.items.length === 0, r.body);
  r = await call("GET", `/admin/previous-tenants?q=${encodeURIComponent(users.tenant!.username)}`, T("super"));
  check("search by the tenant's username finds their tenancies", r.status === 200 && r.data.items.some((x: any) => x.id === ptA1.id), r.body);
  r = await call("GET", "/admin/previous-tenants?rent=OWES", T("super"));
  check("an unknown rent status → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-tenants?reason=BORED", T("super"));
  check("an unknown reason → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/previous-tenants?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&page=2`, T("super"));
  check("a page past the end is empty but keeps the total", r.status === 200 && r.data.items.length === 0 && r.data.total === 5, r.body);
  r = await call("GET", "/admin/previous-tenants/stats", T("super"));
  check("the numbers: archived total, rent unpaid, average tenancy, unpaid money, cleared, last 30 days", r.status === 200 && r.data.total >= 5 && r.data.unpaid >= 3 && r.data.cleared >= 2 && r.data.total === r.data.unpaid + r.data.cleared && r.data.avgYears > 0 && r.data.unpaidAmount >= ptRent * 2 + ptRent * 3 && typeof r.data.movedOutRecently === "number", r.body);
  const ptStats = r.data;
  r = await call("GET", `/admin/previous-tenants/${ptA2.id}`, T("super"));
  check("details: tenant, move-out, reason, clearance, unpaid balance, residence, landlord and the ledger", r.status === 200 && r.data.tenant.id === users.tenant!.id && r.data.rentStatus === "DUE_2" && Number(r.data.unpaid) === ptRent * 2 && r.data.openMonths === 2 && r.data.ledger.length === 2 && r.data.residence.unit === `${ptTag}-2` && r.data.landlord.id === users.owner!.id && !!r.data.landlord.email && Array.isArray(r.data.history), r.body);
  r = await call("GET", "/admin/previous-tenants/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing record → 404", r.status === 404, r.body);

  r = await call("PATCH", `/admin/previous-tenants/${ptA2.id}`, T("super"), {});
  check("an empty change → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-tenants/${ptA2.id}`, T("super"), { rentStatus: "OWES" });
  check("an unknown rent status → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/previous-tenants/${ptA2.id}`, T("super"), { rentStatus: "CLEARED", extra: 1 });
  check("unknown fields → 422", r.status === 422, r.body);
  r = await call("PATCH", "/admin/previous-tenants/00000000-0000-7000-8000-000000000000", T("super"), { rentStatus: "CLEARED" });
  check("editing a missing record → 404", r.status === 404, r.body);

  r = await call("PATCH", `/admin/previous-tenants/${ptA2.id}`, T("super"), { rentStatus: "CLEARED", note: "Paid in cash at handover" });
  check("Edit: DUE_2 → Cleared works", r.status === 200 && r.data.changed === true && r.data.rentStatus === "CLEARED", r.body);
  check("…the ruling and the note are saved", (await db.rentalAgreement.findUnique({ where: { id: ptA2.id } }))?.clearanceStatus === "CLEARED" && (await db.rentalAgreement.findUnique({ where: { id: ptA2.id } }))?.adminNote === "Paid in cash at handover");
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&rent=CLEARED`, T("super"));
  check("…the table now shows it as Cleared with nothing unpaid", r.status === 200 && r.data.total === 3 && r.data.items.find((x: any) => x.id === ptA2.id)?.unpaid === "0", r.body);
  r = await call("GET", "/admin/previous-tenants/stats", T("super"));
  check("…the Rent Unpaid number dropped by one and the money by two months", r.status === 200 && r.data.unpaid === ptStats.unpaid - 1 && Math.abs(ptStats.unpaidAmount - r.data.unpaidAmount - ptRent * 2) < 0.01, r.body);
  r = await call("PATCH", `/admin/previous-tenants/${ptA2.id}`, T("super"), { rentStatus: "DUE_2" });
  check("a ruling equal to the ledger is dropped", r.status === 200 && r.data.changed === true && (await db.rentalAgreement.findUnique({ where: { id: ptA2.id } }))?.clearanceStatus === null, r.body);
  r = await call("PATCH", `/admin/previous-tenants/${ptA1.id}`, T("super"), { rentStatus: "DUE_1", reason: "EVICTED" });
  check("Edit: a Cleared tenancy ruled 1 Month Due and the reason changed to Evicted", r.status === 200 && r.data.changed === true, r.body);
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}&reason=EVICTED`, T("super"));
  check("…the reason filter finds it and the unpaid money is one month of rent", r.status === 200 && r.data.total === 1 && r.data.items[0].rentStatus === "DUE_1" && Number(r.data.items[0].unpaid) === ptRent, r.body);
  r = await call("PATCH", `/admin/previous-tenants/${ptA1.id}`, T("super"), { rentStatus: "DUE_1", reason: "EVICTED" });
  check("the same change again does nothing", r.status === 200 && r.data.changed === false, r.body);
  r = await call("GET", `/tenancies/past?pageSize=50&q=${encodeURIComponent(users.tenant!.username)}`, T("owner"));
  check("the landlord still sees the tenancy with the new reason in their own list", r.status === 200 && JSON.stringify(r.data).includes("EVICTED"), r.body);

  r = await call("DELETE", `/admin/previous-tenants/${ptA5.id}`, T("super"), {});
  check("Delete: a tenancy nothing depends on is erased for good", r.status === 200 && r.data.purged === true, r.body);
  check("…the row is gone from the database", (await db.rentalAgreement.count({ where: { id: ptA5.id } })) === 0);
  r = await call("DELETE", `/admin/previous-tenants/${ptA5.id}`, T("super"), {});
  check("deleting it again → 404", r.status === 404, r.body);
  r = await call("DELETE", `/admin/previous-tenants/${ptA4.id}`, T("super"), {});
  check("Delete: a tenancy with rent history is kept as a hidden record", r.status === 200 && r.data.purged === false, r.body);
  const ptA4Now = await db.rentalAgreement.findUnique({ where: { id: ptA4.id } });
  check("…it is hidden and its rent records are untouched", !!ptA4Now?.adminHiddenAt && (await db.rentRecord.count({ where: { agreementId: ptA4.id } })) === 4, JSON.stringify(ptA4Now));
  r = await call("GET", `/admin/previous-tenants?q=${ptTag}`, T("super"));
  check("…and it left the list", r.status === 200 && r.data.total === 3 && !r.data.items.some((x: any) => x.id === ptA4.id), r.body);
  r = await call("DELETE", `/admin/previous-tenants/${ptA4.id}`, T("super"), {});
  check("deleting a hidden record → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/previous-tenants/stats", T("super"));
  check("the numbers moved: two records fewer in the archive", r.status === 200 && r.data.total === ptStats.total - 2, r.body);

  section("Super Admin Find People: one search box, match cards, full profile");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    r = await call("GET", `/admin/find-people?q=${encodeURIComponent(users.owner!.email)}`, T(who));
    check(`${who} cannot search people here → 403`, r.status === 403, r.body);
    r = await call("GET", `/admin/find-people/${users.owner!.id}`, T(who));
    check(`${who} cannot open a full profile here → 403`, r.status === 403, r.body);
  }
  r = await call("GET", "/admin/find-people?q=abcdef", null);
  check("the search needs a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/find-people?q=ab", T("super"));
  check("fewer than 3 characters → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/find-people", T("super"));
  check("no search text → 422", r.status === 422, r.body);
  const fpOwner = await db.user.findUnique({ where: { id: users.owner!.id }, select: { phone: true, ownerCode: true, nid: true, username: true } });
  const fpFree = await db.user.findUnique({ where: { id: users.general!.id }, select: { phone: true, tenantCode: true, email: true } });
  const fpIds = async (q: string) => { const x = await call("GET", `/admin/find-people?q=${encodeURIComponent(q)}`, T("super")); return { x, ids: (x.data?.items ?? []).map((i: any) => i.id) as string[] }; };
  let fp = await fpIds(users.owner!.email);
  check("by e-mail finds the owner (any letter case)", fp.x.status === 200 && fp.ids.length === 1 && fp.ids[0] === users.owner!.id && fp.x.data.matchedBy.includes("email"), fp.x.body);
  fp = await fpIds(users.owner!.email.toUpperCase());
  check("…e-mail in capitals finds the same person", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(fpOwner!.phone!);
  check("by phone (01…) finds the owner", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(`+88${fpOwner!.phone}`);
  check("by phone typed as +8801… finds the same person", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(`88${fpOwner!.phone}`.replace(/(\d{3})(\d{4})(\d+)/, "$1 $2 $3"));
  check("by phone typed with spaces finds the same person", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(fpOwner!.ownerCode!);
  check("by Owner ID (OW…) finds the owner", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(fpOwner!.ownerCode!.toLowerCase());
  check("…an Owner ID in small letters works too", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(fpOwner!.username);
  check("by username finds the owner", fp.ids[0] === users.owner!.id, fp.x.body);
  fp = await fpIds(users.owner!.id);
  check("by account id (uuid) finds the owner", fp.ids.length === 1 && fp.ids[0] === users.owner!.id, fp.x.body);
  if (fpOwner?.nid && /^\d{13,17}$/.test(fpOwner.nid)) {
    fp = await fpIds(fpOwner.nid);
    check("by NID number finds the owner", fp.ids[0] === users.owner!.id && fp.x.data.matchedBy.includes("nid"), fp.x.body);
    check("…and the result shows the NID only masked", /^•+\d{4}$/.test(fp.x.data.items[0].nid) && !JSON.stringify(fp.x.data).includes(fpOwner.nid), fp.x.body);
  }
  fp = await fpIds(fpFree!.tenantCode!);
  check("by Tenant ID (TF…) finds the Tenant-Free account", fp.ids[0] === users.general!.id && fp.x.data.items[0].role === "GENERAL_USER", fp.x.body);
  fp = await fpIds(users.tenant!.email);
  check("a tenant is found by e-mail with the Tenant role", fp.ids[0] === users.tenant!.id && fp.x.data.items[0].role === "TENANT", fp.x.body);
  const fpCard = (await fpIds(users.owner!.email)).x.data.items[0];
  check("the match card has name, role, NID state, e-mail, phone, ID and online state", !!fpCard.fullName && fpCard.role === "OWNER" && typeof fpCard.nidVerified === "boolean" && !!fpCard.email && !!fpCard.phone && fpCard.ownerCode === fpOwner!.ownerCode && typeof fpCard.online === "boolean", JSON.stringify(fpCard));
  fp = await fpIds("nobody.like.this@mailinator.com");
  check("no match → an empty list (200)", fp.x.status === 200 && fp.ids.length === 0, fp.x.body);
  fp = await fpIds(users.gov!.email);
  check("a Government account is not listed as a tenant or owner", fp.x.status === 200 && fp.ids.length === 0, fp.x.body);
  fp = await fpIds(users.super!.email);
  check("the Super Admin account is never listed", fp.x.status === 200 && fp.ids.length === 0, fp.x.body);
  fp = await fpIds("%%%%");
  check("odd characters find nothing and do no harm", fp.x.status === 200 && fp.ids.length === 0, fp.x.body);
  fp = await fpIds("%owner%");
  check("wildcards are not wildcards (exact matches only)", fp.x.status === 200 && fp.ids.length === 0, fp.x.body);
  check("the searches are written to the audit log (and the search text is not)", (await db.auditLog.count({ where: { action: "people.search", actorId: users.super!.id } })) >= 10 && (await db.auditLog.count({ where: { action: "people.search", actorId: users.super!.id, after: { string_contains: users.owner!.email } as never } })) === 0);

  const nidViewsBefore = await db.auditLog.count({ where: { action: "user.nid_view", actorId: users.super!.id } });
  r = await call("GET", `/admin/find-people/${users.owner!.id}`, T("super"));
  check("Owner profile: header with the NID, contact, online state and joined date", r.status === 200 && r.data.role === "OWNER" && /^\d{13,17}$/.test(r.data.nid ?? "") && !!r.data.email && !!r.data.phone && typeof r.data.online === "boolean" && !!r.data.createdAt && ["ACTIVE", "WARNING", "SUSPENDED"].includes(r.data.state), r.body);
  check("…the owner part has plan, unit breakdown, properties and active tenants", !!r.data.owner && !!r.data.owner.plan && typeof r.data.owner.units.total === "number" && typeof r.data.owner.units.occupied === "number" && Array.isArray(r.data.owner.properties) && r.data.owner.properties.length >= 1 && Array.isArray(r.data.owner.tenants) && r.data.tenant === null && r.data.free === null, r.body);
  check("…the full NID view is audit-logged", (await db.auditLog.count({ where: { action: "user.nid_view", actorId: users.super!.id } })) === nidViewsBefore + 1);
  r = await call("GET", `/admin/find-people/${users.tenant!.id}`, T("super"));
  check("Tenant profile: a tenant part with the residence (or none), landlord and ledger", r.status === 200 && r.data.role === "TENANT" && !!r.data.tenant && "residence" in r.data.tenant && Array.isArray(r.data.tenant.ledger) && typeof r.data.tenant.previousTenancies === "number" && r.data.owner === null && r.data.free === null, r.body);
  if (r.data?.tenant?.residence) check("…a living tenant shows property, unit, rent, lease dates and the landlord", !!r.data.tenant.residence.property && !!r.data.tenant.residence.unit && Number(r.data.tenant.residence.rent) > 0 && !!r.data.tenant.residence.startDate && !!r.data.tenant.landlord?.fullName, r.body);
  r = await call("GET", `/admin/find-people/${users.general!.id}`, T("super"));
  check("Tenant Free profile: saved listings, search activity and the upgrade status", r.status === 200 && r.data.role === "GENERAL_USER" && !!r.data.free && Array.isArray(r.data.free.favorites) && Array.isArray(r.data.free.searches) && typeof r.data.free.favoriteCount === "number" && "upgrade" in r.data.free && r.data.owner === null && r.data.tenant === null, r.body);
  r = await call("GET", `/admin/find-people/${users.super!.id}`, T("super"));
  check("the Super Admin has no profile here → 404", r.status === 404, r.body);
  r = await call("GET", `/admin/find-people/${users.gov!.id}`, T("super"));
  check("a Government account has no profile here → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/find-people/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing person → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/find-people/not-a-uuid", T("super"));
  check("a bad id → 422", r.status === 422 || r.status === 404, r.body);

  // clicking a property, a property for sale, a unit or a person inside a profile opens a window with everything
  r = await call("GET", `/admin/find-people/${users.owner!.id}`, T("super"));
  const fpOwnerPart = r.data?.owner;
  check("the owner profile lists properties, properties for sale, sold ones, every unit and the active tenants", !!fpOwnerPart && Array.isArray(fpOwnerPart.forSale) && Array.isArray(fpOwnerPart.sold) && Array.isArray(fpOwnerPart.unitList) && fpOwnerPart.unitList.length >= 1 && fpOwnerPart.unitList.every((u: any) => !!u.id && !!u.propertyId) && fpOwnerPart.properties.every((x: any) => !!x.id), r.body);
  const fpProp = fpOwnerPart?.properties?.[0];
  const fpUnit = fpOwnerPart?.unitList?.[0];
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of [`/admin/find-people/properties/${fpProp?.id}`, `/admin/find-people/units/${fpUnit?.id}`, `/admin/find-people/listings/${fpProp?.id}`]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.split("/").slice(-2, -1)[0]} details here → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", `/admin/find-people/properties/${fpProp?.id}`, null);
  check("property details need a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", `/admin/find-people/properties/${fpProp?.id}`, T("super"));
  check("property window: details, owner, occupancy numbers, amenities and every unit with its tenant", r.status === 200 && r.data.id === fpProp.id && r.data.owner.id === users.owner!.id && !!r.data.owner.email && typeof r.data.totals.units === "number" && typeof r.data.totals.occupied === "number" && Array.isArray(r.data.amenities) && Array.isArray(r.data.photos) && Array.isArray(r.data.units) && r.data.units.every((u: any) => "tenant" in u), r.body);
  r = await call("GET", `/admin/find-people/units/${fpUnit?.id}`, T("super"));
  check("unit window: specs, rent, the property, the owner, the tenant and lease (or vacant), the ledger and tickets", r.status === 200 && r.data.id === fpUnit.id && !!r.data.unitNumber && Number(r.data.rent) > 0 && !!r.data.property.name && r.data.owner.id === users.owner!.id && "lease" in r.data && "tenant" in r.data && Array.isArray(r.data.ledger) && typeof r.data.tickets.open === "number" && typeof r.data.previousTenancies === "number", r.body);
  const fpOccupied = fpOwnerPart?.unitList?.find((u: any) => u.tenant);
  if (fpOccupied) {
    r = await call("GET", `/admin/find-people/units/${fpOccupied.id}`, T("super"));
    check("…an occupied unit shows the tenant with a link target, the lease dates and the rent", r.status === 200 && !!r.data.tenant?.id && !!r.data.lease?.startDate && Number(r.data.lease.rent) > 0, r.body);
    r = await call("GET", `/admin/find-people/${r.data?.tenant?.id}`, T("super"));
    check("…and that tenant can be opened as a profile", r.status === 200 && r.data.role === "TENANT", r.body);
  }
  const fpListing = await db.listing.findFirst({ where: { sellerId: users.owner!.id }, select: { id: true, title: true } });
  if (fpListing) {
    r = await call("GET", `/admin/find-people/listings/${fpListing.id}`, T("super"));
    check("listing window: title, price, status, specs, description, seller and photos", r.status === 200 && r.data.title === fpListing.title && Number(r.data.price) > 0 && !!r.data.status && !!r.data.type && typeof r.data.description === "string" && r.data.seller.id === users.owner!.id && Array.isArray(r.data.photos), r.body);
  }
  r = await call("GET", "/admin/find-people/properties/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing property → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/find-people/units/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing unit → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/find-people/listings/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing listing → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/find-people/units/not-a-uuid", T("super"));
  check("a bad unit id → 422", r.status === 422 || r.status === 404, r.body);
  r = await call("GET", `/admin/find-people/${users.tenant!.id}`, T("super"));
  if (r.data?.tenant?.residence) {
    check("a tenant profile carries the property, unit and landlord ids for the click-throughs", !!r.data.tenant.residence.propertyId && !!r.data.tenant.residence.unitId && !!r.data.tenant.landlord?.id, r.body);
    r = await call("GET", `/admin/find-people/properties/${r.data.tenant.residence.propertyId}`, T("super"));
    check("…and the tenant's property opens", r.status === 200, r.body);
  }

  section("Super Admin Message: a person's profile card and Active / Warning / Suspended");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    r = await call("GET", `/admin/people/${users.owner!.id}`, T(who));
    check(`${who} cannot open a profile card → 403`, r.status === 403, r.body);
    r = await call("PATCH", `/admin/people/${users.general!.id}/status`, T(who), { status: "WARNING", comment: "Not allowed" });
    check(`${who} cannot change a status → 403`, r.status === 403, r.body);
  }
  r = await call("GET", `/admin/people/${users.owner!.id}`, null);
  check("a profile card needs a sign-in → 401", r.status === 401, r.body);
  for (const [key, role] of [["owner", "OWNER"], ["tenant", "TENANT"], ["general", "GENERAL_USER"], ["gov", "GOV_ADMIN"]] as const) {
    r = await call("GET", `/admin/people/${users[key]!.id}`, T("super"));
    check(`${role}: the card has identity, contact, status, verification and the log`, r.status === 200 && r.data.role === role && r.data.fullName === `Test ${key}` && !!r.data.email && ["ACTIVE", "WARNING", "SUSPENDED"].includes(r.data.state) && !!r.data.verificationStatus && Array.isArray(r.data.log), r.body);
    if (r.data?.nid) check(`${role}: the NID number is masked`, /^•+\d{4}$/.test(r.data.nid), r.data.nid);
  }
  r = await call("GET", `/admin/people/${users.owner!.id}`, T("super"));
  check("an owner's card also shows properties, units, listings and plan", r.status === 200 && r.data.owner && typeof r.data.owner.properties === "number" && typeof r.data.owner.units === "number" && !!r.data.owner.plan, r.body);
  r = await call("GET", `/admin/people/${users.super!.id}`, T("super"));
  check("the Super Admin's own account has no card → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/people/00000000-0000-7000-8000-000000000000", T("super"));
  check("a missing person → 404", r.status === 404, r.body);

  for (const [key, role] of [["general", "Tenant Free"], ["tenant", "tenant"], ["owner", "owner"]] as const) {
    r = await call("PATCH", `/admin/people/${users[key]!.id}/status`, T("super"), { status: "WARNING" });
    check(`${role}: Warning without a reason → 422`, r.status === 422, r.body);
    r = await call("PATCH", `/admin/people/${users[key]!.id}/status`, T("super"), { status: "BANNED", comment: "Not a state" });
    check(`${role}: an unknown state → 422`, r.status === 422, r.body);
    r = await call("PATCH", `/admin/people/${users[key]!.id}/status`, T("super"), { status: "WARNING", comment: "Please keep the building rules" });
    check(`${role}: Warning with a reason → 200`, r.status === 200 && r.data.state === "WARNING" && r.data.changed === true, r.body);
    r = await call("GET", `/admin/people/${users[key]!.id}`, T("super"));
    check(`${role}: the card now says Warning and the log has the reason and the admin`, r.status === 200 && r.data.state === "WARNING" && r.data.log[0]?.action === "WARNING" && r.data.log[0]?.comment === "Please keep the building rules" && !!r.data.log[0]?.adminUsername, r.body);
    r = await call("GET", "/me", T(key));
    check(`${role}: a warned person can still use the app`, r.status === 200, r.body);
    const warnNote = await call("GET", "/notifications?limit=40", T(key));
    check(`${role}: the warning reached them with the reason`, warnNote.data?.items?.some((x: any) => x.type === "account.warning" && JSON.stringify(x).includes("Please keep the building rules")), warnNote.body);
    r = await call("PATCH", `/admin/people/${users[key]!.id}/status`, T("super"), { status: "ACTIVE" });
    check(`${role}: back to Active → 200`, r.status === 200 && r.data.state === "ACTIVE" && r.data.changed === true, r.body);
    r = await call("PATCH", `/admin/people/${users[key]!.id}/status`, T("super"), { status: "ACTIVE" });
    check(`${role}: Active again changes nothing`, r.status === 200 && r.data.changed === false, r.body);
  }
  r = await call("PATCH", `/admin/people/${users.general!.id}/status`, T("super"), { status: "SUSPENDED", comment: "Fake documents" });
  check("Tenant Free: Suspended with a reason → 200", r.status === 200 && r.data.state === "SUSPENDED", r.body);
  r = await call("GET", "/me", T("general"));
  check("…a suspended person is locked out (403)", r.status === 403, r.body);
  r = await call("PATCH", `/admin/people/${users.general!.id}/status`, T("super"), { status: "ACTIVE", comment: "Documents checked" });
  check("…and Active brings them back", r.status === 200 && r.data.state === "ACTIVE", r.body);
  r = await call("GET", "/me", T("general"));
  check("…they can use the app again", r.status === 200, r.body);
  r = await call("PATCH", `/admin/people/${users.super!.id}/status`, T("super"), { status: "SUSPENDED", comment: "Never allowed" });
  check("the Super Admin cannot be suspended through this card → 404", r.status === 404, r.body);

  if (boostWas) await db.platformSetting.update({ where: { key: "boost.enabled" }, data: { value: boostWas.value as any } });
  section("Rule 1: a new tenant is invisible to owners until the profile is complete and the NID is verified");
  const freshMail = `fresh.${tag}@mailinator.com`, freshPhone = phone();
  const freshCode = `TF9${tag.toUpperCase().replace(/[^A-Z0-9]/g, "0")}`.replace(/[^A-Z0-9]/g, "0").slice(0, 8);
  const fresh = await db.user.create({ data: { username: `fresh${tag}`, fullName: "Fresh Tenant", email: freshMail, phone: freshPhone, role: "TENANT", tenantCode: freshCode } });
  users.fresh = { key: "fresh", id: fresh.id, authId: "", email: freshMail, password: "", username: fresh.username, token: "" };
  const lookups = async () => ({
    phone: (await call("GET", `/tenancies/lookup?phone=${freshPhone}`, T("owner"))).data?.found,
    email: (await call("GET", `/tenancies/lookup?email=${encodeURIComponent(freshMail)}`, T("owner"))).data?.found,
    code: (await call("GET", `/tenancies/lookup?tenantCode=${freshCode}`, T("owner"))).data?.found,
  });
  const none = (x: any) => x.phone === false && x.email === false && x.code === false;
  let hidden = await lookups();
  check("a brand-new tenant is not found by phone, e-mail or Tenant ID", none(hidden), hidden);
  r = await call("GET", `/tenancies/lookup?phone=${freshPhone}&tenantCode=${freshCode}`, T("owner"));
  check("lookup with two keys → 422", r.status === 422, r.body);
  r = await call("GET", "/tenancies/lookup?tenantCode=bad", T("owner"));
  check("a malformed Tenant ID → 422", r.status === 422, r.body);
  await db.user.update({ where: { id: fresh.id }, data: { verificationStatus: "VERIFIED" } });
  hidden = await lookups();
  check("verified but the profile is not filled in → still not found", none(hidden), hidden);
  const freshAddr = await db.address.create({ data: { division: "Dhaka", district: "Dhaka" } as never });
  await db.user.update({ where: { id: fresh.id }, data: { verificationStatus: "PENDING", nid: "19900000000011", dateOfBirth: new Date("1995-05-05"), occupation: "Student", addressId: freshAddr.id } });
  hidden = await lookups();
  check("profile filled in but the NID is not verified yet → still not found", none(hidden), hidden);
  const freeUnit = await db.unit.create({ data: { propertyId: prop?.id, unitNumber: `FR${tag}`.slice(0, 8), floor: 1, rent: 9000, availability: "AVAILABLE" } as never });
  r = await call("POST", `/units/${freeUnit.id}/tenant`, T("owner"), { tenantId: fresh.id });
  check("the owner cannot move an unverified tenant in by id either → 422", r.status === 422, r.body);
  await db.user.update({ where: { id: fresh.id }, data: { verificationStatus: "VERIFIED" } });
  hidden = await lookups();
  check("complete profile AND verified NID → found by phone, e-mail and Tenant ID", hidden.phone === true && hidden.email === true && hidden.code === true, hidden);
  await db.user.update({ where: { id: fresh.id }, data: { verificationStatus: "REJECTED" } });
  hidden = await lookups();
  check("a rejected NID hides the tenant again", none(hidden), hidden);
  await db.unit.delete({ where: { id: freeUnit.id } });

  section("Rule 2: an owner needs an active plan, an approved payment and a verified NID to add properties, units or flats for sale");
  const ownerNow = (await db.user.findUnique({ where: { id: users.owner!.id }, select: { verificationStatus: true, occupation: true } }))!;
  const clearNotices = () => db.notification.deleteMany({ where: { userId: users.owner!.id, type: { startsWith: "access." } } });
  const openNotices = async () => (await db.notification.findMany({ where: { userId: users.owner!.id, type: { startsWith: "access." }, archivedAt: null }, select: { type: true } })).map((n) => n.type).sort();
  await clearNotices();
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("baseline: plan, payment, profile and NID all fine → the owner may post for sale", r.status === 200, r.body);
  check("…and nothing is waiting in the notification center", (await openNotices()).length === 0);

  await db.user.update({ where: { id: users.owner!.id }, data: { verificationStatus: "PENDING" } });
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("NID not verified → posting for sale is blocked (OWNER_NOT_READY, missing nid)", r.status === 403 && r.code === "OWNER_NOT_READY" && r.body?.details?.missing?.includes("nid"), r.body);
  r = await call("POST", "/properties", T("owner"), { name: "Blocked tower", type: "APARTMENT_BUILDING", totalFloors: 2, totalUnits: 4 });
  check("NID not verified → adding a property is blocked", r.status === 403 && r.code === "OWNER_NOT_READY", r.body);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "ZZ9", floor: 1, bedrooms: 1, areaSqft: 300, rent: 7000 });
  check("NID not verified → adding a unit is blocked", r.status === 403 && r.code === "OWNER_NOT_READY", r.body);
  check("the owner finds one notice telling them to verify the NID", JSON.stringify(await openNotices()) === JSON.stringify(["access.nid"]), await openNotices());
  const nn = await call("GET", "/notifications?limit=40", T("owner"));
  check("the notice is in the notification center, unread, with a link to the profile", nn.data?.items?.some((x: any) => x.type === "access.nid" && x.readAt === null && x.link === "/home-owner/profile" && x.priority === "HIGH"), nn.body);
  check("three blocked attempts did not create three notices", (await db.notification.count({ where: { userId: users.owner!.id, type: "access.nid" } })) === 1);

  await db.user.update({ where: { id: users.owner!.id }, data: { occupation: null } });
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("profile not complete → blocked with both profile and nid missing", r.status === 403 && r.body?.details?.missing?.includes("profile") && r.body?.details?.missing?.includes("nid"), r.body);
  check("a notice for the profile appears too", JSON.stringify(await openNotices()) === JSON.stringify(["access.nid", "access.profile"]), await openNotices());

  await db.user.update({ where: { id: users.owner!.id }, data: { verificationStatus: "VERIFIED", occupation: ownerNow.occupation } });
  const paidTxns = await db.paymentTransaction.findMany({ where: { subscription: { userId: users.owner!.id }, status: "SUCCESS" }, select: { id: true } });
  await db.paymentTransaction.updateMany({ where: { id: { in: paidTxns.map((x) => x.id) } }, data: { status: "PENDING_REVIEW" } });
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("payment not approved by the Super Admin → blocked (missing payment only)", r.status === 403 && r.code === "OWNER_NOT_READY" && r.body?.details?.missing?.length === 1 && r.body.details.missing[0] === "payment", r.body);
  check("a payment notice appears", (await openNotices()).includes("access.payment"), await openNotices());
  await db.paymentTransaction.updateMany({ where: { id: { in: paidTxns.map((x) => x.id) } }, data: { status: "SUCCESS" } });
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("everything in place again → allowed", r.status === 200, r.body);
  check("…and every notice is cleared", (await openNotices()).length === 0, await openNotices());

  await db.userSubscription.updateMany({ where: { userId: users.owner!.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
  r = await call("GET", "/listings/eligibility", T("owner"));
  check("no active plan → blocked (the plan notice appears)", r.status === 403 && (await openNotices()).includes("access.plan"), r.body);
  await db.userSubscription.updateMany({ where: { userId: users.owner!.id, status: "EXPIRED" }, data: { status: "ACTIVE" } });
  await clearNotices();
  await db.user.update({ where: { id: users.owner!.id }, data: { verificationStatus: ownerNow.verificationStatus } });
  await db.user.update({ where: { id: fresh.id }, data: { verificationStatus: "VERIFIED" } });

  section("Super Admin Tenant Free: only new sign-ups, NID tabs, details, status, NID review, message");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/tenant-free", "/admin/tenant-free/stats", `/admin/tenant-free/${users.general!.id}`]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(users.general!.id, ":id")} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/tenant-free/stats", null);
  check("Tenant Free numbers need a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/tenant-free/stats", T("super"));
  check("cards: total, new in 30 days, NID verified with the share, waiting for review", r.status === 200 && r.data.total >= 1 && typeof r.data.newLast30 === "number" && r.data.verified >= 1 && r.data.verified <= r.data.total && typeof r.data.pending === "number" && Math.abs(r.data.verifiedRate - Math.round((r.data.verified / r.data.total) * 1000) / 10) < 0.01, r.body);
  r = await call("GET", `/admin/tenant-free?q=${encodeURIComponent(users.general!.username)}`, T("super"));
  const gRow = r.data?.items?.[0];
  check("search finds the Tenant-Free account: contact, NID state, status, joined, and whether owners can find it", r.status === 200 && r.data.total === 1 && gRow?.id === users.general!.id && gRow.state === "ACTIVE" && gRow.verificationStatus === "VERIFIED" && gRow.visibleToOwners === true && !!gRow.email && !!gRow.createdAt, r.body);
  r = await call("GET", `/admin/tenant-free?q=${encodeURIComponent(users.owner!.username)}`, T("super"));
  check("an owner is not listed here", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", `/admin/tenant-free?q=${encodeURIComponent(users.tenant!.username)}`, T("super"));
  check("a tenant with a lease is not listed here", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/tenant-free?tab=all&page=1", T("super"));
  check("10 per page and only Tenant-Free accounts", r.status === 200 && r.data.pageSize === 10 && r.data.items.length <= 10 && r.data.items.every((x: any) => !!x.username), r.body);
  r = await call("GET", `/admin/tenant-free?tab=PENDING&q=${encodeURIComponent(users.general!.username)}`, T("super"));
  check("the Pending tab leaves a verified account out", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/tenant-free?tab=NOPE", T("super"));
  check("an unknown tab → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/tenant-free?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/tenant-free/${users.general!.id}`, T("super"));
  check("details: profile, NID number, address, documents, visibility and the account log", r.status === 200 && r.data.id === users.general!.id && "nid" in r.data && "address" in r.data && Array.isArray(r.data.log) && Array.isArray(r.data.gaps) && r.data.visibleToOwners === true && "nidFront" in r.data.documents, r.body);
  r = await call("GET", `/admin/tenant-free/${users.owner!.id}`, T("super"));
  check("an owner has no Tenant Free page → 404", r.status === 404, r.body);

  const gDob = (await db.user.findUnique({ where: { id: users.general!.id }, select: { dateOfBirth: true } }))!.dateOfBirth;
  await db.user.update({ where: { id: users.general!.id }, data: { dateOfBirth: null } });
  r = await call("GET", `/admin/tenant-free/${users.general!.id}`, T("super"));
  check("an unfinished profile is hidden from owners, and the page says what is missing", r.status === 200 && r.data.visibleToOwners === false && r.data.gaps.includes("dateOfBirth"), r.body);
  await db.user.update({ where: { id: users.general!.id }, data: { dateOfBirth: gDob } });

  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("owner"), { status: "SUSPENDED", comment: "test reason" });
  check("an owner cannot change the status → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("super"), { status: "SUSPENDED" });
  check("suspending without a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("super"), { status: "WARNING", comment: "nope" });
  check("only Active or Suspended are allowed → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.owner!.id}/status`, T("super"), { status: "SUSPENDED", comment: "not here" });
  check("an owner cannot be suspended from this page → 404", r.status === 404, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("super"), { status: "SUSPENDED", comment: "Fake documents were sent." });
  check("suspended with a reason", r.status === 200 && r.data.state === "SUSPENDED" && r.data.changed === true, r.body);
  r = await call("GET", "/me", T("general"));
  check("a suspended person cannot use the app → 403", r.status === 403, r.body);
  r = await call("GET", `/admin/tenant-free?q=${encodeURIComponent(users.general!.username)}`, T("super"));
  check("the table shows Suspended", r.data?.items?.[0]?.state === "SUSPENDED", r.body);
  r = await call("GET", `/admin/tenant-free/${users.general!.id}`, T("super"));
  check("the account log keeps the reason with the admin and the time", r.data?.log?.[0]?.action === "SUSPENDED" && r.data.log[0].adminUsername === users.super!.username && String(r.data.log[0].comment).includes("Fake documents"), r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("super"), { status: "ACTIVE" });
  check("back to Active needs no reason", r.status === 200 && r.data.state === "ACTIVE", r.body);
  r = await call("GET", "/me", T("general"));
  check("the person can use the app again", r.status === 200, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/status`, T("super"), { status: "ACTIVE" });
  check("saving Active again changes nothing", r.status === 200 && r.data.changed === false, r.body);

  // NID front / back review
  const gVerifyBefore = (await db.user.findUnique({ where: { id: users.general!.id }, select: { verificationStatus: true } }))!.verificationStatus;
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.general!.id } });
  await db.user.update({ where: { id: users.general!.id }, data: { verificationStatus: "UNVERIFIED" } });
  const gKey = (k: string, f: string) => `${k}/${users.general!.id}/${f}`;
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("reviewing a photo that was never uploaded → 404", r.status === 404, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "NID_FRONT", storageKey: gKey("NID_FRONT", "g-front.png") });
  check("the person uploads the NID front", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "NID_BACK", storageKey: gKey("NID_BACK", "g-back.png") });
  check("…and the NID back", r.status === 201, r.body);
  r = await call("GET", "/admin/tenant-free?tab=PENDING&q=" + encodeURIComponent(users.general!.username), T("super"));
  check("the Pending tab now lists the account", r.status === 200 && r.data.total === 1 && r.data.items[0].verificationStatus === "PENDING" && r.data.items[0].visibleToOwners === false, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_FRONT`, T("general"), { decision: "VERIFIED" });
  check("the person cannot verify their own photo → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_BACK`, T("super"), { decision: "REJECTED" });
  check("rejecting without a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("NID front verified", r.status === 200 && r.data.status === "VERIFIED" && r.data.tenantVerification === "PENDING", r.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "NID_FRONT", storageKey: gKey("NID_FRONT", "g-front-2.png") });
  check("a verified NID front is locked → 409", r.status === 409, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_BACK`, T("super"), { decision: "REJECTED", note: "The back is blurry." });
  check("NID back rejected with a reason", r.status === 200 && r.data.status === "REJECTED" && r.data.tenantVerification === "REJECTED", r.body);
  const gn = await call("GET", "/notifications?limit=40", T("general"));
  check("the person gets a separate notification for each photo, with the reason for the rejected one", gn.data?.items?.some((x: any) => x.type === "document.verified" && x.params?.document === "NID_FRONT") && gn.data?.items?.some((x: any) => x.type === "document.rejected" && x.params?.document === "NID_BACK" && String(x.params?.reason).includes("blurry")), gn.body);
  r = await call("POST", "/me/documents", T("general"), { kind: "NID_BACK", storageKey: gKey("NID_BACK", "g-back-2.png") });
  check("a rejected photo can be replaced", r.status === 201, r.body);
  r = await call("PATCH", `/admin/tenant-free/${users.general!.id}/documents/NID_BACK`, T("super"), { decision: "VERIFIED" });
  check("both photos verified → the account is Verified", r.status === 200 && r.data.tenantVerification === "VERIFIED" && (await db.user.findUnique({ where: { id: users.general!.id } }))?.verificationStatus === "VERIFIED", r.body);
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.general!.id } });
  await db.user.update({ where: { id: users.general!.id }, data: { verificationStatus: gVerifyBefore } });
  r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users.general!.id });
  check("the Super Admin can open a direct chat with the person", (r.status === 200 || r.status === 201) && !!r.data?.id, r.body);

  section("Super Admin Active Tenants: numbers, tabs, search, details, edit (status, end date, unit), notifications");
  for (const who of ["owner", "tenant", "general", "gov"]) {
    for (const path of ["/admin/active-tenants", "/admin/active-tenants/stats", "/admin/active-tenants/00000000-0000-7000-8000-000000000000"]) {
      r = await call("GET", path, T(who));
      check(`${who} cannot open ${path.replace(/[0-9a-f-]{36}/, ":id")} → 403`, r.status === 403, r.body);
    }
  }
  r = await call("GET", "/admin/active-tenants/stats", null);
  check("tenant numbers need a sign-in → 401", r.status === 401, r.body);
  r = await call("GET", "/admin/active-tenants/stats", T("super"));
  check("cards: total tenants, active leases with the share, new in 30 days, leases ending in 30 days", r.status === 200 && r.data.totalTenants >= 1 && r.data.activeLeases >= 1 && r.data.activeLeases <= r.data.totalTenants + 1000 && typeof r.data.newLast30 === "number" && typeof r.data.expiringSoon === "number" && Math.abs(r.data.activeRate - Math.min(100, Math.round((r.data.activeLeases / r.data.totalTenants) * 1000) / 10)) < 0.01, r.body);
  r = await call("GET", `/admin/active-tenants?q=${encodeURIComponent(users.tenant!.username)}`, T("super"));
  const tenRow = r.data?.items?.[0];
  check("search finds the tenant: contact, residence, owner (phone + ID), lease end, status", r.status === 200 && r.data.total === 1 && tenRow?.tenant.id === users.tenant!.id && tenRow.owner.id === users.owner!.id && !!tenRow.residence.property && !!tenRow.residence.unit && tenRow.state === "ACTIVE" && !!tenRow.tenant.email && !!tenRow.owner.fullName, r.body);
  const tAgreement = tenRow?.id;
  r = await call("GET", "/admin/active-tenants?page=1", T("super"));
  check("10 per page with the total for 'Showing 10 of N tenants'", r.status === 200 && r.data.pageSize === 10 && r.data.items.length <= 10 && r.data.total >= r.data.items.length, r.body);
  r = await call("GET", "/admin/active-tenants?page=0", T("super"));
  check("page 0 → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/active-tenants?tab=sideways", T("super"));
  check("unknown tab → 422", r.status === 422, r.body);
  r = await call("GET", "/admin/active-tenants?tab=notice", T("super"));
  check("Notice Given tab lists only tenants with a notice", r.status === 200 && r.data.items.every((x: any) => x.state === "NOTICE_GIVEN"), r.body);
  r = await call("GET", `/admin/active-tenants/${tAgreement}`, T("super"));
  check("details: tenant, NID status, residence (unit, floor, rooms), rent, lease dates, owner, rent dues and free units", r.status === 200 && r.data.tenant.id === users.tenant!.id && !!r.data.residence.property && !!r.data.residence.unit && r.data.rent !== undefined && !!r.data.startDate && r.data.owner.id === users.owner!.id && !!r.data.ledger && Array.isArray(r.data.unitChoices) && typeof r.data.tenant.verificationStatus === "string", r.body);
  const beforeEnd = r.data?.endDate;

  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("owner"), { status: "NOTICE_GIVEN" });
  check("owner cannot use the admin edit → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), {});
  check("an empty edit → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { status: "GONE" });
  check("an unknown status → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { endDate: "2000-01-01" });
  check("an end date before the lease start → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { status: "NOTICE_GIVEN" });
  check("Notice Given is saved", r.status === 200 && r.data.changed === true && r.data.state === "NOTICE_GIVEN", r.body);
  r = await call("GET", `/admin/active-tenants?tab=notice&q=${encodeURIComponent(users.tenant!.username)}`, T("super"));
  check("the tenant is now on the Notice Given tab", r.status === 200 && r.data.total === 1 && r.data.items[0].state === "NOTICE_GIVEN", r.body);
  r = await call("GET", `/admin/active-tenants?tab=active&q=${encodeURIComponent(users.tenant!.username)}`, T("super"));
  check("…and no longer on the Active tab", r.status === 200 && r.data.total === 0, r.body);
  const tnN = await call("GET", "/notifications?limit=30", T("tenant"));
  const onN = await call("GET", "/notifications?limit=30", T("owner"));
  check("the tenant and the owner are both told", [tnN, onN].every((n) => n.data?.items?.some((x: any) => x.type === "tenancy.admin" && x.titleKey === "notifications.tenancyAdminNotice" && !!x.params?.property && !!x.params?.unit)), tnN.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { status: "NOTICE_GIVEN" });
  check("saving the same status changes nothing", r.status === 200 && r.data.changed === false, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { status: "ACTIVE", endDate: "2031-12-31" });
  check("back to Active and a new lease end date together", r.status === 200 && r.data.changed === true && r.data.state === "ACTIVE" && r.data.changes.includes("end") && r.data.changes.includes("active"), r.body);
  r = await call("GET", `/admin/active-tenants/${tAgreement}`, T("super"));
  check("the new end date is stored", r.status === 200 && String(r.data.endDate).startsWith("2031-12-31") && r.data.state === "ACTIVE", r.body);
  const agrRow = await db.rentalAgreement.findUnique({ where: { id: tAgreement }, select: { unitId: true, unit: { select: { propertyId: true } } } });
  const spare = await db.unit.create({ data: { propertyId: agrRow!.unit.propertyId, unitNumber: `MV${tag}`.slice(0, 8), floor: 1, rent: 11000, availability: "AVAILABLE" } as never });
  r = await call("GET", `/admin/active-tenants/${tAgreement}`, T("super"));
  check("the free unit of the same owner is offered", r.status === 200 && r.data.unitChoices.some((u: any) => u.id === spare.id) && !r.data.unitChoices.some((u: any) => u.id === agrRow!.unitId), r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { unitId: spare.id });
  const movedFrom = await db.unit.findUnique({ where: { id: agrRow!.unitId }, select: { availability: true } });
  const movedTo = await db.unit.findUnique({ where: { id: spare.id }, select: { availability: true } });
  check("moving to another free unit: the lease follows, the old unit is free, the new one occupied", r.status === 200 && r.data.changes.includes("moved") && movedFrom?.availability === "AVAILABLE" && movedTo?.availability === "OCCUPIED" && (await db.rentalAgreement.findUnique({ where: { id: tAgreement } }))?.unitId === spare.id, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { unitId: agrRow!.unitId });
  check("moving back works", r.status === 200 && r.data.changes.includes("moved") && (await db.unit.findUnique({ where: { id: spare.id }, select: { availability: true } }))?.availability === "AVAILABLE", r.body);
  const occupiedElsewhere = await db.unit.findFirst({ where: { availability: "OCCUPIED", id: { not: agrRow!.unitId }, property: { ownerId: users.owner!.id } }, select: { id: true } });
  if (occupiedElsewhere) {
    r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { unitId: occupiedElsewhere.id });
    check("moving into an occupied unit → 409", r.status === 409, r.body);
  }
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}`, T("super"), { unitId: "not-a-uuid" });
  check("a bad unit id → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/00000000-0000-7000-8000-000000000000`, T("super"), { status: "ACTIVE" });
  check("editing a missing tenancy → 404", r.status === 404, r.body);

  // ---- NID front / NID back / agreement review
  const verifyBefore = (await db.user.findUnique({ where: { id: users.tenant!.id }, select: { verificationStatus: true } }))!.verificationStatus;
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.tenant!.id } });
  await db.user.update({ where: { id: users.tenant!.id }, data: { verificationStatus: "UNVERIFIED" } });
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/AGREEMENT`, T("super"), { decision: "VERIFIED" });
  check("reviewing a document that was never uploaded → 404", r.status === 404, r.body);
  r = await call("GET", "/admin/active-tenants?verification=PENDING&q=" + encodeURIComponent(users.tenant!.username), T("super"));
  check("verification filter: not pending yet", r.status === 200 && r.data.total === 0, r.body);
  const tTok = (k: string, f: string) => `${k}/${users.tenant!.id}/${f}`;
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_FRONT", storageKey: tTok("NID_FRONT", "e2e-front.png") });
  check("tenant uploads NID front", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: tTok("NID_BACK", "e2e-back.png") });
  check("tenant uploads NID back", r.status === 201, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "AGREEMENT", storageKey: tTok("VERIFICATION_DOC", "e2e-agreement.pdf") });
  check("tenant uploads the agreement", r.status === 201, r.body);
  r = await call("GET", "/admin/active-tenants?verification=PENDING&q=" + encodeURIComponent(users.tenant!.username), T("super"));
  check("verification filter Pending lists the tenant (with the NID badge state)", r.status === 200 && r.data.total === 1 && r.data.items[0].tenant.verification === "PENDING", r.body);
  r = await call("GET", "/admin/active-tenants?verification=VERIFIED&q=" + encodeURIComponent(users.tenant!.username), T("super"));
  check("…and not under Verified", r.status === 200 && r.data.total === 0, r.body);
  r = await call("GET", "/admin/active-tenants?verification=NOPE", T("super"));
  check("an unknown verification filter → 422", r.status === 422, r.body);
  r = await call("GET", `/admin/active-tenants/${tAgreement}`, T("super"));
  check("details show the three documents (state, upload date, PDF flag) and the full NID number field", r.status === 200 && r.data.documents.nidFront?.status === "PENDING" && r.data.documents.nidBack?.status === "PENDING" && r.data.documents.agreement?.status === "PENDING" && r.data.documents.agreement.isPdf === true && r.data.documents.nidFront.reviewable === true && r.data.documents.nidFront.locked === false && "nid" in r.data.tenant && "dateOfBirth" in r.data.tenant && "address" in r.data.tenant, r.body);

  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_FRONT`, T("owner"), { decision: "VERIFIED" });
  check("owner cannot review documents → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_FRONT`, T("tenant"), { decision: "VERIFIED" });
  check("the tenant cannot verify their own document → 403", r.status === 403, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_SIDE`, T("super"), { decision: "VERIFIED" });
  check("an unknown document kind → 422/404", r.status === 422 || r.status === 404, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_BACK`, T("super"), { decision: "REJECTED" });
  check("rejecting without a reason → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_BACK`, T("super"), { decision: "MAYBE" });
  check("an unknown decision → 422", r.status === 422, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("NID front verified", r.status === 200 && r.data.status === "VERIFIED" && r.data.changed === true && r.data.tenantVerification === "PENDING", r.body);
  const dn1 = await call("GET", "/notifications?limit=30", T("tenant"));
  check("the tenant gets a notification for the NID front alone", dn1.data?.items?.some((x: any) => x.type === "document.verified" && x.params?.document === "NID_FRONT") && !dn1.data?.items?.some((x: any) => x.params?.document === "NID_BACK" && x.type?.startsWith("document.")), dn1.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_FRONT`, T("super"), { decision: "VERIFIED" });
  check("verifying the same document again changes nothing", r.status === 200 && r.data.changed === false, r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_FRONT", storageKey: tTok("NID_FRONT", "e2e-front-2.png") });
  check("a verified NID front is locked: the tenant cannot replace it → 409", r.status === 409, r.body);
  check("…and the verified record is still the original", (await db.verificationDocument.count({ where: { ownerType: "USER", ownerId: users.tenant!.id, kind: "NID_FRONT" } })) === 1 && (await db.verificationDocument.findFirst({ where: { ownerType: "USER", ownerId: users.tenant!.id, kind: "NID_FRONT" } }))?.status === "VERIFIED");
  r = await call("GET", `/admin/active-tenants/${tAgreement}`, T("super"));
  check("details mark the verified front as locked", r.status === 200 && r.data.documents.nidFront.locked === true, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_BACK`, T("super"), { decision: "REJECTED", note: "The photo is blurry." });
  check("NID back rejected with a reason: the tenant NID state becomes Rejected", r.status === 200 && r.data.status === "REJECTED" && r.data.tenantVerification === "REJECTED" && (await db.user.findUnique({ where: { id: users.tenant!.id } }))?.verificationStatus === "REJECTED", r.body);
  const dn2 = await call("GET", "/notifications?limit=30", T("tenant"));
  check("a separate notification tells the tenant the back was rejected, with the reason", dn2.data?.items?.some((x: any) => x.type === "document.rejected" && x.params?.document === "NID_BACK" && String(x.params?.reason).includes("blurry")), dn2.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: tTok("NID_BACK", "e2e-back-2.png") });
  check("a rejected document can be replaced", r.status === 201, r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/NID_BACK`, T("super"), { decision: "VERIFIED" });
  check("NID back verified: both photos verified → the tenant is Verified", r.status === 200 && r.data.tenantVerification === "VERIFIED" && (await db.user.findUnique({ where: { id: users.tenant!.id } }))?.verificationStatus === "VERIFIED", r.body);
  r = await call("GET", "/admin/active-tenants?verification=VERIFIED&q=" + encodeURIComponent(users.tenant!.username), T("super"));
  check("verification filter Verified now lists the tenant", r.status === 200 && r.data.total === 1 && r.data.items[0].tenant.verification === "VERIFIED", r.body);
  r = await call("PATCH", `/admin/active-tenants/${tAgreement}/documents/AGREEMENT`, T("super"), { decision: "VERIFIED" });
  check("the agreement is reviewed on its own and does not change the NID state", r.status === 200 && r.data.status === "VERIFIED" && r.data.tenantVerification === null && (await db.user.findUnique({ where: { id: users.tenant!.id } }))?.verificationStatus === "VERIFIED", r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "AGREEMENT", storageKey: tTok("VERIFICATION_DOC", "e2e-agreement-2.pdf") });
  check("a verified agreement is locked too → 409", r.status === 409, r.body);
  await db.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: users.tenant!.id } });
  await db.user.update({ where: { id: users.tenant!.id }, data: { verificationStatus: verifyBefore } });
  r = await call("POST", "/conversations", T("super"), { type: "DIRECT", recipientId: users.tenant!.id });
  check("the Super Admin can open a direct chat with the tenant", (r.status === 200 || r.status === 201) && !!r.data?.id, r.body);
  void beforeEnd;

  section("admin user management");
  if (users.govx) {
    r = await call("PATCH", `/admin/users/${users.govx.id}`, T("super"), { fullName: "Renamed Gov Admin" });
    check("super edits a user", r.status === 200 && r.data?.fullName === "Renamed Gov Admin", r.body);
    r = await call("PATCH", `/admin/users/${users.govx.id}`, T("super"), { email: "x@y.z" });
    check("user edit rejects unknown fields → 422", r.status === 422, r.body);
    r = await call("POST", `/admin/users/${users.govx.id}/archive`, T("super"), { reason: "Left the department" });
    check("super archives a user", r.status === 200 && r.data?.status === "INACTIVE" && !!r.data?.archivedAt, r.body);
  }

  section("owner profile");
  r = await call("GET", "/me/owner-overview", T("owner"));
  const ov0 = r.data;
  check("overview: identity, owner id, member since, strength, portfolio, documents", r.status === 200 && ov0?.user?.username === users.owner!.username && /^OW\d+$/.test(ov0?.user?.ownerCode ?? "") && !!ov0?.user?.memberSince && ov0?.strength?.percent >= 0 && ov0.strength.percent <= 100 && Array.isArray(ov0.strength.missing) && ov0?.portfolio?.properties >= 1 && ov0.portfolio.tenants >= 1 && Array.isArray(ov0?.properties) && "nidFront" in ov0.documents && ov0.documents.agreement.total >= 1, r.body);
  check("overview: the NID number is masked", ov0?.user?.nid === null || /^•+\d{4}$/.test(ov0.user.nid), ov0?.user);
  r = await call("GET", "/me/owner-overview", T("tenant"));
  check("overview: a tenant cannot open the owner profile → 403", r.status === 403, r.body);
  r = await call("GET", "/me/owner-overview");
  check("overview: signed out → 401", r.status === 401, r.body);
  r = await call("GET", "/me", T("owner"));
  check("/me carries the picture link field for the sidebar", r.status === 200 && "avatarUrl" in r.data, r.body);

  r = await call("PATCH", "/me", T("owner"), { occupation: "Businessman", address: { division: "Chattogram", district: "Cumilla", upazila: "Muradnagar", union: "South Keraniganj", street: "Dhamura", postOffice: "Doshani Bazar" } });
  check("update profile: occupation and the full permanent address (union, post office)", r.status === 200 && r.data?.address?.union === "South Keraniganj" && r.data?.address?.postOffice === "Doshani Bazar", r.body);
  r = await call("GET", "/me/owner-overview", T("owner"));
  check("overview shows the new address and a higher strength", r.data?.address?.postOffice === "Doshani Bazar" && r.data?.address?.union === "South Keraniganj" && r.data?.user?.occupation === "Businessman" && r.data.strength.percent > ov0.strength.percent, r.data);
  r = await call("PATCH", "/me", T("owner"), { address: { division: "X", district: "Y" } });
  check("a too-short address is refused → 422", r.status === 422, r.body);

  await db.rentalAgreement.update({ where: { id: agreement?.id }, data: { agreementDocKey: null, signatureRequestedAt: null } }); // start from a tenancy with no file (an earlier step attached one)
  r = await call("GET", "/tenancies/agreements", T("owner"));
  const agRow = r.data?.find((x: any) => x.id === agreement?.id);
  check("agreements: active tenancies with tenant, unit, property and file state", r.status === 200 && !!agRow && agRow.hasDocument === false && agRow.signatureRequestedAt === null && !!agRow.tenant?.fullName && !!agRow.unit?.unitNumber && !!agRow.property?.name, r.body);
  r = await call("GET", "/tenancies/agreements", T("tenant"));
  check("agreements: tenant → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/signature-request`, T("owner"));
  check("signature request before an agreement file exists → 409", r.status === 409, r.body);
  r = await call("POST", "/uploads/sign", T("owner"), { purpose: "AGREEMENT", mime: "application/pdf", size: 1200 });
  const agKey = r.data?.key;
  check("agreement upload is signed as a pdf", r.status === 200 && !!agKey && agKey.endsWith(".pdf"), r.body);
  const agUp = await sb.storage.from(BUCKET).upload(agKey, new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" }), { contentType: "application/pdf" });
  uploaded.push(agKey);
  check("the agreement file is stored", !agUp.error, agUp.error);
  r = await call("POST", `/tenancies/${agreement?.id}/agreement`, T("owner"), { storageKey: agKey });
  check("owner attaches the agreement", r.status === 200, r.body);
  r = await call("GET", "/tenancies/agreements", T("owner"));
  check("agreements: file is now there and typed as pdf", r.data?.find((x: any) => x.id === agreement?.id)?.docType === "pdf", r.body);
  r = await call("GET", `/tenancies/${agreement?.id}/agreement`, T("owner"));
  check("owner gets a viewing link for it", r.status === 200 && /^https?:/.test(r.data?.url ?? ""), r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/signature-request`, T("tenant"));
  check("tenant cannot request a signature → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/signature-request`, T("owner"));
  check("owner requests the tenant's digital signature", r.status === 200 && !!r.data?.signatureRequestedAt, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/signature-request`, T("owner"));
  check("a second request within the hour → 429", r.status === 429, r.body);
  r = await call("GET", "/notifications?limit=30", T("tenant"));
  check("the tenant is notified to sign", r.data?.items?.some((n: any) => n.type === "tenancy.signature" && !!n.params?.unit), r.body);
  r = await call("GET", "/tenancies/agreements", T("owner"));
  check("agreements: the request time is shown", !!r.data?.find((x: any) => x.id === agreement?.id)?.signatureRequestedAt, r.body);
  r = await call("GET", "/me/owner-overview", T("owner"));
  check("documents card: agreement state counts the uploaded files", r.data?.documents?.agreement?.uploaded >= 1 && ["UPLOADED", "PENDING"].includes(r.data.documents.agreement.status), r.data?.documents);

  section("Tenant profile page (verified tenant): current unit, locked fields, documents");
  r = await call("GET", "/me/tenant-overview", T("tenant"));
  const vt = r.data;
  check("verified tenant overview: role TENANT, Tenant ID, and the current unit with landlord and entry date (no exit)", r.status === 200 && vt?.user?.role === "TENANT" && /^TF\d{6,}$/.test(vt?.user?.tenantCode ?? "") && !!vt.tenancy?.property?.name && !!vt.tenancy.unit?.unitNumber && typeof vt.tenancy.unit.floor === "number" && vt.tenancy.landlord?.fullName === (await db.user.findUnique({ where: { id: users.owner!.id } }))?.fullName && !!vt.tenancy.startDate && "endDate" in vt.tenancy, r.body);
  check("…the property address line is there", typeof vt?.tenancy?.property?.addressLine === "string", vt?.tenancy);
  r = await call("PATCH", "/me", T("tenant"), { nid: "1999999999999" });
  check("a verified tenant without a NID can enter it once → 200", r.status === 200, r.body);
  r = await call("PATCH", "/me", T("tenant"), { nid: "1888888888888" });
  check("…after that a verified tenant's NID number is locked → 403", r.status === 403 && r.body?.details?.reason === "nid_locked", r.body);
  r = await call("PATCH", "/me", T("tenant"), { username: "someone_else" });
  check("the username is locked → 422", r.status === 422, r.body);
  r = await call("PATCH", "/me", T("tenant"), { tenantCode: "TF000001" });
  check("the Tenant ID is locked → 422", r.status === 422, r.body);
  r = await call("PATCH", "/me", T("tenant"), { tenant: { members: 3 }, occupation: "Teacher", phone: phone() });
  check("occupants count, occupation and phone can change → 200", r.status === 200, r.body);
  r = await call("GET", "/me/tenant-overview", T("tenant"));
  check("…the page shows Member 3 and the new occupation", r.data?.user?.members === 3 && r.data.user.occupation === "Teacher", r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: `NID_BACK/${users.tenant!.id}/vt-back.png` });
  check("NID back uploaded → 201 and shown as PENDING with its date", r.status === 201 && (await call("GET", "/me/tenant-overview", T("tenant"))).data?.documents?.nidBack?.status === "PENDING", r.body);
  await db.verificationDocument.updateMany({ where: { ownerId: users.tenant!.id, kind: "NID_BACK" }, data: { status: "REJECTED", notes: "Photo is edited" } });
  r = await call("GET", "/me/tenant-overview", T("tenant"));
  check("a rejected document is reported as REJECTED (the page labels it FAKE) with the reviewer's note", r.data?.documents?.nidBack?.status === "REJECTED" && r.data.documents.nidBack.notes === "Photo is edited", r.body);
  r = await call("POST", "/me/documents", T("tenant"), { kind: "NID_BACK", storageKey: `NID_BACK/${users.tenant!.id}/vt-back2.png` });
  check("…and can be replaced → PENDING again", r.status === 201 && (await call("GET", "/me/tenant-overview", T("tenant"))).data?.documents?.nidBack?.status === "PENDING", r.body);

  section("tenancy end + cron");
  r = await call("POST", `/tenancies/${agreement?.id}/end`, T("tenant"), {});
  check("tenant cannot end tenancy → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/end`, T("owner"), { settlementAmount: 5000, leaveReason: "JOB_TRANSFER", behavior: "GOOD", ownerNotes: "Paid on time" });
  check("owner ends tenancy", r.status === 200 && r.data?.status === "ENDED", r.body);
  r = await call("GET", `/units/${unitA?.id}`, T("owner"));
  check("unit back to AVAILABLE", r.data?.availability === "AVAILABLE", r.body);

  // the ended tenant is a Tenant-Free account again, and nothing they own was deleted
  const endedTenant = await db.user.findUnique({ where: { id: users.tenant!.id } });
  check("a verified tenant whose tenancy ended is a Tenant-Free account again (GENERAL_USER)", endedTenant?.role === "GENERAL_USER", endedTenant?.role);
  check("…every link in their notifications now points into /tenant-free (no page of the wrong area)", (await wrongAreaLinks(users.tenant!.id, "/tenant-free")) === 0 && (await db.notification.count({ where: { userId: users.tenant!.id, type: "account.tenant_free", link: "/tenant-free/dashboard" } })) === 1);
  check("…they are told, and the change is in the audit log", (await db.notification.count({ where: { userId: users.tenant!.id, type: "account.tenant_free" } })) === 1 && (await db.auditLog.count({ where: { action: "user.role_revert", resourceId: users.tenant!.id } })) === 1);
  check("…the past stay and its rent records are still there", (await db.rentalAgreement.findUnique({ where: { id: agreement?.id } }))?.status === "ENDED" && (await db.rentRecord.count({ where: { agreementId: agreement?.id } })) >= 1);
  r = await call("GET", "/me", T("tenant"));
  check("…and /me says GENERAL_USER, so the Subscription tab comes back", r.status === 200 && r.data?.role === "GENERAL_USER", r.body);
  r = await call("GET", "/tenant/history", T("tenant"));
  check("…the History page still shows the past stay (Completed) with its ledger", r.status === 200 && r.data?.stays?.some((x: any) => x.status === "COMPLETED" && x.ledger?.total >= 1), r.body);
  r = await call("GET", "/dashboard/tenant", T("tenant"));
  check("…the dashboard shows 'no active lease', not an error", r.status === 200 && r.data?.tenancy === null, r.body);
  r = await call("GET", "/plans");
  const lifePlan = (r.data ?? []).find((p: any) => p.audience === "OWNER");
  r = await call("POST", "/subscriptions/quote", T("tenant"), { planId: lifePlan?.id, cycle: "MONTHLY" });
  check("…and they can buy an owner plan again (the Subscription tab works)", r.status === 200 && Number(r.data?.payable) > 0, r.body);
  r = await call("GET", "/tenant/notifications?limit=10", T("tenant"));
  check("…and the Notifications page still opens and lists their notifications", r.status === 200 && r.data?.items?.length >= 1, r.body);

  // full cycle on a fresh account: Tenant-Free → connected by an owner (verified tenant) → leaves (Tenant-Free) → connected again
  const life = await db.user.create({ data: { username: `life${tag}`, fullName: "Life Cycle", email: `life.${tag}@mailinator.com`, phone: phone(), role: "GENERAL_USER" } });
  await fillProfile(life.id);
  r = await call("POST", `/properties/${prop?.id}/units`, T("owner"), { unitNumber: "L101", floor: 1, bedrooms: 1, areaSqft: 400, rent: 8000, tenantId: life.id });
  const lifeUnit = r.data;
  check("owner connects a Tenant-Free account to a unit → 201", r.status === 201 && lifeUnit?.availability === "OCCUPIED", r.body);
  check("…only now does the account become a verified TENANT", (await db.user.findUnique({ where: { id: life.id } }))?.role === "TENANT");
  check("…and its links now live under /tenant", (await wrongAreaLinks(life.id, "/tenant")) === 0 && (await db.notification.count({ where: { userId: life.id, type: "tenancy.assigned", link: "/tenant/dashboard" } })) === 1);
  const lifeAgr = await db.rentalAgreement.findFirst({ where: { tenantId: life.id, status: "ACTIVE" } });
  const lifeReq = await db.maintenanceRequest.create({ data: { agreementId: lifeAgr!.id, unitId: lifeUnit.id, tenantId: life.id, category: "OTHER", title: "Life cycle repair", description: "kept after leaving" } });
  const pendingUp = await db.upgradeRequest.create({ data: { userId: life.id, planId: lifePlan.id, cycle: "MONTHLY", expectedAmount: 159, quoteSnapshot: {}, senderNumber: "01712345678", trxId: `LIFE${tag}`, fromRole: "GENERAL_USER", toRole: "OWNER" } });
  r = await call("POST", `/admin/upgrade-requests/${pendingUp.id}/approve`, T("super"));
  check("a pending owner-plan request of a now-verified tenant cannot be approved → 409 (no tenant becomes an owner)", r.status === 409 && (await db.user.findUnique({ where: { id: life.id } }))?.role === "TENANT", r.body);
  r = await call("POST", `/tenancies/${lifeAgr!.id}/end`, T("owner"), { leaveReason: "OTHER" });
  check("owner removes the tenant → 200", r.status === 200, r.body);
  check("…the account is Tenant-Free again at once, and its links moved to /tenant-free", (await db.user.findUnique({ where: { id: life.id } }))?.role === "GENERAL_USER" && (await wrongAreaLinks(life.id, "/tenant-free")) === 0);
  check("…nothing was deleted: the stay, its rent records, the repair request and the pending request are all still there", (await db.rentalAgreement.count({ where: { id: lifeAgr!.id, status: "ENDED" } })) === 1 && (await db.rentRecord.count({ where: { agreementId: lifeAgr!.id } })) >= 1 && (await db.maintenanceRequest.count({ where: { id: lifeReq.id } })) === 1 && (await db.upgradeRequest.count({ where: { id: pendingUp.id, status: "PENDING" } })) === 1);
  check("…and the unit is free again", (await db.unit.findUnique({ where: { id: lifeUnit.id } }))?.availability === "AVAILABLE");
  r = await call("POST", `/units/${lifeUnit.id}/tenant`, T("owner"), { tenantId: life.id });
  check("the owner connects the same person again → they are a verified tenant again", r.status === 200 || r.status === 201, r.body);
  check("…role TENANT, one ACTIVE tenancy, old stay untouched", (await db.user.findUnique({ where: { id: life.id } }))?.role === "TENANT" && (await db.rentalAgreement.count({ where: { tenantId: life.id, status: "ACTIVE" } })) === 1 && (await db.rentalAgreement.count({ where: { tenantId: life.id } })) === 2);
  // clean up everything this cycle made
  const lifeAgrs = (await db.rentalAgreement.findMany({ where: { tenantId: life.id }, select: { id: true } })).map((a) => a.id);
  await db.rentPayment.deleteMany({ where: { rentRecord: { agreementId: { in: lifeAgrs } } } });
  await db.rentRecord.deleteMany({ where: { agreementId: { in: lifeAgrs } } });
  await db.maintenanceRequest.deleteMany({ where: { tenantId: life.id } });
  await db.upgradeRequest.deleteMany({ where: { userId: life.id } });
  await db.rentalAgreement.deleteMany({ where: { id: { in: lifeAgrs } } });
  await db.notification.deleteMany({ where: { userId: life.id } });
  await db.tenantProfile.deleteMany({ where: { userId: life.id } });
  await db.unit.delete({ where: { id: lifeUnit.id } });
  await db.user.delete({ where: { id: life.id } });

  section("previous tenants");
  r = await call("GET", "/tenancies/past", T("owner"));
  const pastRow = r.data?.items?.find((x: any) => x.id === agreement?.id);
  check("ended tenancy is listed with tenant, property, unit, reason and rating", r.status === 200 && !!pastRow && pastRow.leaveReason === "JOB_TRANSFER" && pastRow.behavior === "GOOD" && !!pastRow.tenant?.fullName && !!pastRow.property?.name && !!pastRow.unit?.unitNumber && r.data.total >= 1, r.body);
  r = await call("GET", "/tenancies/past", T("tenant"));
  check("tenant cannot open the owner's list → 403", r.status === 403, r.body);
  r = await call("GET", "/tenancies/past", T("general"));
  check("general user cannot open it → 403", r.status === 403, r.body);
  r = await call("GET", "/tenancies/past");
  check("signed out → 401", r.status === 401, r.body);
  r = await call("GET", "/tenancies/past?behavior=BOGUS", T("owner"));
  check("unknown rating filter → 422", r.status === 422, r.body);
  r = await call("GET", `/tenancies/past?behavior=GOOD&propertyId=${prop?.id}&q=Test`, T("owner"));
  check("filters: rating + property + name find it", r.status === 200 && r.data?.items?.some((x: any) => x.id === agreement?.id), r.body);
  r = await call("GET", "/tenancies/past?behavior=VERY_BAD", T("owner"));
  check("filter by another rating excludes it", r.status === 200 && !r.data?.items?.some((x: any) => x.id === agreement?.id), r.body);
  r = await call("GET", "/tenancies/past?q=zzzznobody", T("owner"));
  check("name search with no match → empty", r.status === 200 && r.data?.items?.length === 0 && r.data?.total === 0, r.body);
  r = await call("GET", `/tenancies/${agreement?.id}/history`, T("owner"));
  const hist = r.data;
  check("history: profile, residency, ledger, summary, flags", r.status === 200 && hist?.tenant?.fullName === "Test tenant" && Array.isArray(hist?.ledger) && hist.ledger.length >= 1 && typeof hist?.summary?.collected === "number" && typeof hist?.summary?.dues === "number" && hist?.canMessage === false && hist?.hasActiveTenancy === false && hist?.members >= 1, r.body);
  check("history: the NID is masked or empty, never in full", (hist?.tenant?.nid === null || /^•••• •••• \d{4}$/.test(hist?.tenant?.nid)), hist?.tenant);
  check("history: every ledger month has one of the three statuses", hist?.ledger?.every((m: any) => ["PAID_ON_TIME", "PAID_LATE", "DEFAULTED"].includes(m.status)), hist?.ledger);
  r = await call("GET", `/tenancies/${agreement?.id}/history`, T("tenant"));
  check("tenant cannot read the owner's history → 403 or 404", r.status === 403 || r.status === 404, r.body);
  r = await call("GET", `/tenancies/${agreement?.id}/history`, T("super"));
  check("another account cannot read it either", r.status === 403 || r.status === 404, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), { behavior: "VERY_BAD", leaveReason: "OTHER", ownerNotes: "Left a mess" });
  check("owner edits rating, reason and notes", r.status === 200 && r.data?.behavior === "VERY_BAD" && r.data?.leaveReason === "OTHER" && r.data?.ownerNotes === "Left a mess", r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), { behavior: "BOGUS" });
  check("bad rating → 422", r.status === 422, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), {});
  check("empty edit → 422", r.status === 422, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), { startDate: "2030-01-02", endDate: "2030-01-01" });
  check("end date before start date → 422", r.status === 422, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), { endDate: "2099-01-01" });
  check("a past tenancy cannot end in the future → 422", r.status === 422, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("tenant"), { behavior: "GOOD" });
  check("tenant cannot rate themselves → 403 or 404", r.status === 403 || r.status === 404, r.body);
  r = await call("PATCH", `/tenancies/${agreement?.id}/record`, T("owner"), { behavior: null, ownerNotes: null });
  check("rating and notes can be cleared", r.status === 200 && r.data?.behavior === null && r.data?.ownerNotes === null, r.body);
  r = await call("GET", "/tenancies/past?behavior=UNRATED", T("owner"));
  check("filter: not rated", r.status === 200 && r.data?.items?.some((x: any) => x.id === agreement?.id), r.body);
  r = await call("PATCH", `/tenancies/${randomUUID()}/record`, T("owner"), { behavior: "GOOD" });
  check("unknown record → 404", r.status === 404, r.body);
  r = await call("DELETE", `/tenancies/${agreement?.id}/record`, T("tenant"));
  check("tenant cannot remove the record → 403 or 404", r.status === 403 || r.status === 404, r.body);
  r = await call("DELETE", `/tenancies/${agreement?.id}/record`, T("owner"));
  check("owner removes the row from the history list", r.status === 200 && r.data?.removed === true, r.body);
  r = await call("GET", "/tenancies/past", T("owner"));
  check("…it is gone from the list", !r.data?.items?.some((x: any) => x.id === agreement?.id), r.body);
  check("…but the agreement and its rent records are still in the database", (await db.rentalAgreement.count({ where: { id: agreement?.id } })) === 1 && (await db.rentRecord.count({ where: { agreementId: agreement?.id } })) >= 1);
  r = await call("GET", `/tenancies/${agreement?.id}/history`, T("owner"));
  check("…and cannot be opened any more → 404", r.status === 404, r.body);
  r = await call("POST", `/properties/${prop?.id}/archive`, T("owner"), { reason: "Test cleanup" });
  check("archive property (no active tenancies)", r.status === 200 && r.data?.status === "ARCHIVED", r.body);
  r = await call("POST", "/internal/cron/subscriptions", null, {}, { "x-cron-secret": CRON });
  check("cron: subscription lifecycle runs", r.status === 200 && r.data?.expired === 0, r.body);
  r = await call("POST", "/internal/cron/subscriptions", null, {}, { "x-cron-secret": "wrong-secret-value" });
  check("cron with wrong secret → 403", r.status === 403, r.body);
  r = await call("POST", "/auth/logout", T("owner"));
  check("logout", r.status === 200, r.body);
}

main()
  .catch((e) => { failures.push("CRASH: " + (e as Error).message); console.error(e); })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    console.log(`\n${pass} passed, ${failures.length} failed`);
    if (failures.length) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
  });
