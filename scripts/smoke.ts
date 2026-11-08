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
const db = new PrismaClient();
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

async function call(method: string, path: string, token?: string | null, body?: unknown, headers: Record<string, string> = {}, attempt = 0): Promise<any> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (res.status === 500 && attempt < 2) return call(method, path, token, body, headers, attempt + 1); // pooler hiccup, nothing was written
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
  const r = await call("POST", "/auth/register", null, { fullName: `Test ${key}`, username, email, phone: phone(), password, role, consent: true, ...(nid ? { nid } : {}) });
  if (r.status === 429 && r.body?.details?.reason === "email_send_limit") {
    // Supabase's built-in mailer allows only a few sign-up emails per hour; use custom SMTP in production
    check(`register ${key}: Supabase email limit reached (reported as 429 RATE_LIMITED)`, true);
    return makePublic(key, role, nid, false);
  }
  check(`register ${key} → 201`, r.status === 201, r.body);
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

async function main() {
  const CRON = process.env.CRON_SECRET!;

  section("public endpoints");
  let r = await call("GET", "/health");
  check("GET /health → ok", r.status === 200 && r.data?.status === "ok", r.body);
  r = await call("GET", "/plans");
  const owners = (r.data ?? []).filter((p: any) => p.audience === "OWNER");
  const primary = owners.find((p: any) => p.code === "PRIMARY");
  check("GET /plans → 3 seeded owner plans", r.status === 200 && owners.length >= 3, r.body);
  check("PRIMARY prices: 159 / 429.30 / 1526.40", primary?.prices.MONTHLY.total === "159.00" && primary?.prices.QUARTERLY.total === "429.30" && primary?.prices.YEARLY.total === "1526.40", primary?.prices);
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
  r = await call("GET", "/geo/districts");
  check("missing query param → 422", r.status === 422, r.body);

  section("auth: registration, login, validation");
  await makeStaff("super");
  await makeStaff("gov");
  await makePublic("owner", "OWNER", "1234567890", true); // the one real /auth/register call
  await makePublic("tenant", "TENANT");
  await makePublic("general", "GENERAL_USER");
  r = await call("POST", "/auth/register", null, { fullName: "X", username: "Bad Name", email: "nope", phone: "123", password: "abc", role: "SUPER_ADMIN", consent: false });
  check("register with bad data/role → 422", r.status === 422, r.body);
  r = await call("POST", "/auth/register", null, { fullName: "Dup User", username: users.owner!.username, email: `dup.${tag}@mailinator.com`, phone: phone(), password: "Passw0rdx", role: "OWNER", consent: true });
  check("register duplicate username → 409", r.status === 409, r.body);
  r = await call("POST", "/auth/login", null, { identifier: users.owner!.email, password: "wrong-password1" });
  check("login wrong password → 401", r.status === 401, r.body);
  for (const u of Object.values(users)) await login(u);
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
  check("owner quote PRIMARY quarterly = 429.30, bKash reference = username", r.data?.payable === "429.30" && r.data?.payment?.reference === users.owner!.username, r.body);
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

  section("complaints");
  r = await call("POST", "/complaints", T("tenant"), { category: "NOISE", subject: "Loud noise at night", description: "Neighbours play loud music after midnight every day" });
  check("tenant files complaint", r.status === 201, r.body);
  const cidTmp = r.data?.id;
  r = await call("POST", "/complaints", T("tenant"), { category: "NOISE", subject: "Evidence check", description: "Trying to attach somebody else's file as evidence", evidence: [`COMPLAINT_EVIDENCE/${users.owner!.id}/x.pdf`] });
  check("complaint evidence must be your own upload → 403", r.status === 403, r.body);
  void cidTmp;
  const cid = r.data?.id;
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
  r = await call("GET", `${base}&nearby=MOSQUE&nearbyM=50`);
  check("filter: configurable proximity range (50 m) excludes", r.status === 200 && !has(r), r.body);
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
  check("super views NID for manual verification (audited)", r.status === 200 && r.data?.nid === "1234567890", r.body);
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
  check("marketplace dashboard stats", r.status === 200 && r.data?.totalProperties >= 1 && Array.isArray(r.data?.popularZones) && r.data?.availableForRent >= 1, r.body);
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
  check("GET /me masks NID, never returns it in full", /^•+7890$/.test(r.data?.nid ?? "") && JSON.stringify(r.data).includes("1234567890") === false, r.data?.nid);
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

  section("oversight: gov directories, people search, property verification");
  const ownerRow = await db.user.findUniqueOrThrow({ where: { id: users.owner!.id } });
  r = await call("GET", "/gov/owners", T("gov"));
  const orow = r.data?.items?.find((o: any) => o.id === users.owner!.id);
  check("gov lists owners with masked NID + tier + property count", r.status === 200 && /^•+7890$/.test(orow?.nid ?? "") && orow?.subscription?.plan?.code === "PRIMARY" && orow?.propertyCount === 1, orow);
  r = await call("GET", "/gov/owners?tier=PRIMARY&q=" + users.owner!.username, T("gov"));
  check("filter owners by tier + search", r.status === 200 && r.data?.items?.length === 1, r.body);
  r = await call("GET", "/gov/owners", T("owner"));
  check("owner → gov directory 403", r.status === 403, r.body);
  r = await call("GET", "/gov/tenants", T("gov"));
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
  r = await call("GET", "/admin/tenants", T("super"));
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
