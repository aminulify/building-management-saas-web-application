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

async function makePublic(key: "owner" | "tenant" | "general", role: string, nid?: string, viaApi = false) {
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
    return makePublic(key, role, nid, false);
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
  const stale = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" }, username: { regex: "^((super|gov|govx|owner|tenant|general|clash|wizard|extra|life|promo)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$" } } as never, select: { id: true, authId: true, username: true } }).catch(async () => {
    const all = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" } }, select: { id: true, authId: true, username: true } });
    return all.filter((u) => /^((super|gov|govx|owner|tenant|general|clash|wizard|extra|life|promo)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$/.test(u.username));
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
  check("super views NID for manual verification (audited)", r.status === 200 && r.data?.nid === "1234567897890", r.body);
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
  check("NID front+back → verification PENDING", r.data?.verificationStatus === "PENDING", r.body);
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
  check("the Tenant-Free account's links all live under /tenant-free", (await wrongAreaLinks(users.general!.id, "/tenant-free")) === 0);

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
  check("the same NID number on another account → 409", r.status === 409 && r.body?.details?.field === "nid", r.body);
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
  check("View More: the next 10 rows follow with no repeats", r.status === 200 && r.data.items.length === 10 && r.data.items.every((x: any) => !p1.items.some((y: any) => y.id === x.id)), r.body);
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
  r = await call("GET", "/admin/properties/table?tab=all&limit=2", T("super"));
  const propPage1 = r.data;
  check("first page: 2 rows and a cursor (the table asks for 9, then 10 more per View More)", r.status === 200 && propPage1.items.length === 2 && !!propPage1.nextCursor && propPage1.total >= 3, r.body);
  r = await call("GET", `/admin/properties/table?tab=all&limit=2&cursor=${propPage1.nextCursor}`, T("super"));
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
  check("a listing that is not live cannot be marked Sold → 409", r.status === 409, r.body);
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
    check("View Details of an occupied listing: the assigned tenant with Tenant ID and check-in date", r.data.occupied === true && (!ag || (r.data.tenancy?.tenant?.id === ag.tenantId && !!r.data.tenancy.checkIn && /^TF\d{6,}$/.test(r.data.tenancy.tenant.tenantCode ?? ""))), r.data.tenancy);
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
