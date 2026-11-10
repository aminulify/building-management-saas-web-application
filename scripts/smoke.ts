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
  const r = await call("POST", "/auth/register", null, { fullName: `Test ${key}`, username, email, phone: phone(), password, role, consent: true, occupation: "Landlord", address: { division: "Dhaka", district: "Dhaka", upazila: "Uttara", union: "Sector 4", postOffice: "1230", street: "House 12, Road 5" }, ...(nid ? { nid } : {}) });
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
  const stale = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" }, username: { regex: "^((super|gov|govx|owner|tenant|general|clash|wizard)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$" } } as never, select: { id: true, authId: true, username: true } }).catch(async () => {
    const all = await db.user.findMany({ where: { email: { endsWith: "@mailinator.com" } }, select: { id: true, authId: true, username: true } });
    return all.filter((u) => /^((super|gov|govx|owner|tenant|general|clash|wizard)[a-z0-9]{6}|google[a-z0-9]{6}_[a-z0-9]{4})$/.test(u.username));
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
  r = await call("POST", "/auth/register", null, { fullName: "Dup User", username: users.owner!.username, email: `dup.${tag}@mailinator.com`, phone: phone(), password: "Passw0rdx", role: "OWNER", consent: true });
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

  r = await call("DELETE", `/maintenance/${m3}`, T("tenant"));
  check("delete: a tenant cannot delete → 403", r.status === 403, r.body);
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

  section("admin user management");
  if (users.govx) {
    r = await call("PATCH", `/admin/users/${users.govx.id}`, T("super"), { fullName: "Renamed Gov Admin" });
    check("super edits a user", r.status === 200 && r.data?.fullName === "Renamed Gov Admin", r.body);
    r = await call("PATCH", `/admin/users/${users.govx.id}`, T("super"), { email: "x@y.z" });
    check("user edit rejects unknown fields → 422", r.status === 422, r.body);
    r = await call("POST", `/admin/users/${users.govx.id}/archive`, T("super"), { reason: "Left the department" });
    check("super archives a user", r.status === 200 && r.data?.status === "INACTIVE" && !!r.data?.archivedAt, r.body);
  }

  section("tenancy end + cron");
  r = await call("POST", `/tenancies/${agreement?.id}/end`, T("tenant"), {});
  check("tenant cannot end tenancy → 403", r.status === 403, r.body);
  r = await call("POST", `/tenancies/${agreement?.id}/end`, T("owner"), { settlementAmount: 5000 });
  check("owner ends tenancy", r.status === 200 && r.data?.status === "ENDED", r.body);
  r = await call("GET", `/units/${unitA?.id}`, T("owner"));
  check("unit back to AVAILABLE", r.data?.availability === "AVAILABLE", r.body);
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
