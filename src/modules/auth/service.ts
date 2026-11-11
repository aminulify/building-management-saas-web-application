import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import { nextTenantCode } from "@/modules/users/tenant-code";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { toActor } from "@/lib/auth/require-actor";
import { finalizeRegistrationUploads } from "./registration-uploads";
import { isEmail, type loginSchema, type registerSchema } from "./schema";

type Register = z.infer<typeof registerSchema>;
type Login = z.infer<typeof loginSchema>;

/** Public sign-up for OWNER / TENANT / GENERAL_USER. Owners start without a plan (read-only onboarding, D4). */
export async function register(input: Register, req: Request) {
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);

  const nidHash = input.nid ? sha256(input.nid) : undefined;
  const dup = await db.user.findFirst({
    where: { OR: [{ username: input.username }, { email: input.email }, { phone: input.phone }, ...(nidHash ? [{ nidHash }] : [])] },
    select: { username: true, email: true, phone: true, nidHash: true },
  });
  if (dup) {
    const field = dup.username === input.username ? "username" : dup.email === input.email ? "email" : dup.phone === input.phone ? "phone" : "nid";
    throw new AppError("CONFLICT", { field });
  }

  const { data, error } = await supabaseAnon().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username: input.username } },
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) throw new AppError("RATE_LIMITED", { reason: "email_send_limit" });
  if (error || !data.user) throw new AppError("VALIDATION_ERROR", [{ path: "email", code: error?.code ?? "auth_rejected" }]);

  try {
    const user = await db.user.create({
      data: {
        authId: data.user.id,
        username: input.username,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        tenantCode: await nextTenantCode(), // every sign-up starts as a Tenant-Free account with a permanent Tenant ID
        locale: input.locale,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        occupation: input.occupation,
        // "Post Office" is free text; when the user typed a 4-digit code it is also kept as the postal code
        ...(input.address ? { address: { create: { ...input.address, postalCode: input.address.postalCode ?? (/^\d{4}$/.test(input.address.postOffice ?? "") ? input.address.postOffice : undefined) } } } : {}),
        ...(input.nid ? { nid: input.nid, nidHash, nidLast4: input.nid.slice(-4) } : {}),
        // an owner profile is created when a plan is approved, a tenant profile when an owner connects the person
      },
      select: { id: true, username: true, role: true, email: true },
    });
    const documents = input.uploadSession ? await finalizeRegistrationUploads(user.id, input.uploadSession) : null;
    return {
      ...user,
      documents,
      // when the project requires e-mail confirmation there is no session yet: the client must tell the user to confirm
      needsEmailConfirmation: !data.session,
      session: data.session ? { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at } : null,
    };
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(data.user.id); // no orphan auth accounts
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT");
    throw e;
  }
}

async function resolveEmail(identifier: string): Promise<string | null> {
  if (isEmail(identifier)) return identifier;
  // username (a-z0-9_) or Bangladeshi phone, with or without +88
  const phone = identifier.replace(/[\s\-]/g, "").replace(/^\+?88(?=01)/, "");
  const u = await db.user.findFirst({ where: { OR: [{ username: identifier }, { phone }] }, select: { email: true } });
  return u?.email ?? null;
}

/** Same generic failure for unknown user / wrong password so accounts can't be enumerated. */
export async function login(input: Login, req: Request) {
  rateLimit(`login:${clientIp(req)}:${input.identifier}`, 5, 15 * 60_000);

  const email = await resolveEmail(input.identifier);
  if (!email) throw new AppError("UNAUTHENTICATED");

  const { data, error } = await supabaseAnon().auth.signInWithPassword({ email, password: input.password });
  // Supabase only says "not confirmed" after the password was correct, so this does not reveal who has an account
  if (error?.code === "email_not_confirmed") throw new AppError("EMAIL_NOT_CONFIRMED");
  if (error || !data.session) throw new AppError("UNAUTHENTICATED");

  const user = await db.user.findUnique({ where: { authId: data.user.id } });
  if (!user) throw new AppError("UNAUTHENTICATED");
  toActor(user); // throws ACCOUNT_SUSPENDED for non-ACTIVE accounts

  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return {
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
    user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName, locale: user.locale },
  };
}

export async function sendOtp(identifier: string, req: Request) {
  const key = isEmail(identifier) ? { email: identifier } : { phone: `+88${identifier}` };
  rateLimit(`otp:${identifier}`, 3, 10 * 60_000);
  rateLimit(`otp-ip:${clientIp(req)}`, 10, 10 * 60_000);
  // shouldCreateUser:false → OTP never creates accounts; response is identical whether or not the user exists
  await supabaseAnon().auth.signInWithOtp({ ...key, options: { shouldCreateUser: false } });
  return { sent: true };
}

export async function verifyOtp(identifier: string, token: string) {
  rateLimit(`otp-verify:${identifier}`, 5, 10 * 60_000);
  const client = supabaseAnon();
  const { data, error } = isEmail(identifier)
    ? await client.auth.verifyOtp({ email: identifier, token, type: "email" })
    : await client.auth.verifyOtp({ phone: `+88${identifier}`, token, type: "sms" });
  if (error || !data.session) throw new AppError("UNAUTHENTICATED");
  return { verified: true, accessToken: data.session.access_token };
}

export async function logout(accessToken: string) {
  await supabaseAdmin().auth.admin.signOut(accessToken);
  return { ok: true };
}

export async function forgotPassword(email: string, req: Request) {
  rateLimit(`forgot:${clientIp(req)}`, 5, 15 * 60_000);
  rateLimit(`forgot-email:${email}`, 3, 15 * 60_000);
  // the response is always {sent:true} (no account enumeration), but a failed send must not be silent for the operator
  const { error } = await supabaseAnon().auth.resetPasswordForEmail(email);
  if (error) console.error("[auth] recovery email not sent:", error.code ?? error.status, error.message);
  return { sent: true };
}

/** Step 2 of recovery: swaps the 6-digit code from the recovery email for a short-lived recovery token (sent to /password/reset). */
export async function verifyRecoveryCode(email: string, token: string, req: Request) {
  rateLimit(`recovery-verify:${email}`, 5, 10 * 60_000);
  rateLimit(`recovery-verify-ip:${clientIp(req)}`, 20, 10 * 60_000);
  const { data, error } = await supabaseAnon().auth.verifyOtp({ email, token, type: "recovery" });
  if (error || !data.session) throw new AppError("UNAUTHENTICATED");
  return { verified: true, accessToken: data.session.access_token };
}

/** Called with the recovery session's bearer token. */
export async function resetPassword(accessToken: string, password: string) {
  const { data, error } = await supabaseAnon().auth.getUser(accessToken);
  if (error || !data.user) throw new AppError("UNAUTHENTICATED");
  const { error: upErr } = await supabaseAdmin().auth.admin.updateUserById(data.user.id, { password });
  if (upErr) throw new AppError("VALIDATION_ERROR", [{ path: "password", code: "rejected" }]);
  await supabaseAdmin().auth.admin.signOut(accessToken).catch(() => undefined); // the recovery token is single-purpose: revoke it
  return { ok: true };
}

/** Exchanges a refresh token for a new session ("Stay logged in"). */
export async function refresh(refreshToken: string, req: Request) {
  rateLimit(`refresh:${clientIp(req)}`, 60, 60_000);
  const { data, error } = await supabaseAnon().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw new AppError("UNAUTHENTICATED");
  const user = await db.user.findUnique({ where: { authId: data.session.user.id } });
  if (!user) throw new AppError("UNAUTHENTICATED");
  toActor(user); // a suspended account cannot keep refreshing
  return {
    session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at },
    user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName, locale: user.locale },
  };
}
