import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAnon } from "@/lib/supabase";
import { nextTenantCode } from "@/modules/users/tenant-code";
import { toActor } from "@/lib/auth/require-actor";

/* ---------- which social providers are switched on in Supabase (cached 5 min) ---------- */
let cache: { at: number; google: boolean } | null = null;

export async function getProviders() {
  // a "disabled" answer is re-checked after 20 s so enabling Google in the dashboard takes effect quickly
  if (cache && Date.now() - cache.at < (cache.google ? 5 * 60_000 : 20_000)) return { google: cache.google };
  let google = false;
  try {
    const r = await fetch(`${env().SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env().SUPABASE_ANON_KEY } });
    google = !!(await r.json()).external?.google;
  } catch { /* treat as unavailable */ }
  cache = { at: Date.now(), google };
  return { google };
}

/* ---------- start Google sign-in ---------- */
export const oauthUrlQuery = z.object({ redirectTo: z.string().url().max(300) });

/** The browser may only come back to /bn|en/auth/callback on the same site that asked (no open redirect). */
export function allowedRedirect(redirectTo: string, req: Request): boolean {
  try {
    const u = new URL(redirectTo);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return u.host === host && /^\/(bn|en)\/auth\/callback$/.test(u.pathname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

export async function googleUrl(q: z.infer<typeof oauthUrlQuery>, req: Request) {
  rateLimit(`oauth-url:${clientIp(req)}`, 30, 60_000);
  if (!allowedRedirect(q.redirectTo, req)) throw new AppError("VALIDATION_ERROR", [{ path: "redirectTo", code: "not_allowed" }]);
  if (!(await getProviders()).google) throw new AppError("INVALID_STATE", { reason: "google_not_enabled" });
  const u = new URL(`${env().SUPABASE_URL}/auth/v1/authorize`);
  u.searchParams.set("provider", "google");
  u.searchParams.set("redirect_to", q.redirectTo);
  return { url: u.toString() };
}

/* ---------- first Google sign-in: make sure a local account exists ---------- */
export const completeSchema = z.object({ locale: z.enum(["bn", "en"]).default("bn") });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "user";

async function freeUsername(base: string) {
  for (let i = 0; i < 8; i++) {
    const candidate = `${slug(base)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.user.count({ where: { username: candidate } }))) return candidate;
  }
  return `user_${Date.now().toString(36)}`.slice(0, 20);
}

/**
 * Called by the browser right after Supabase hands back a Google session.
 * - known account → returned as is (suspended accounts are refused)
 * - new person → GENERAL_USER (free account); they can upgrade to Owner/Tenant later
 * - the same e-mail already registered with a password under a different login → conflict (never silently merged)
 */
export async function completeOAuth(accessToken: string, input: z.infer<typeof completeSchema>, req: Request) {
  rateLimit(`oauth-complete:${clientIp(req)}`, 20, 60_000);
  const { data, error } = await supabaseAnon().auth.getUser(accessToken);
  if (error || !data.user) throw new AppError("UNAUTHENTICATED");
  const sb = data.user;

  const known = await db.user.findUnique({ where: { authId: sb.id } });
  if (known) {
    toActor(known);
    await db.user.update({ where: { id: known.id }, data: { lastSeenAt: new Date() } });
    return { user: publicUser(known), isNew: false };
  }

  const email = sb.email?.toLowerCase();
  if (!email || !sb.email_confirmed_at) throw new AppError("FORBIDDEN", { reason: "email_not_verified_by_provider" });
  if (await db.user.count({ where: { email } })) throw new AppError("CONFLICT", { reason: "email_registered", field: "email" });

  const meta = (sb.user_metadata ?? {}) as { full_name?: string; name?: string };
  const fullName = (meta.full_name ?? meta.name ?? email.split("@")[0]!).trim().slice(0, 100) || email;
  const user = await db.user.create({
    data: { authId: sb.id, email, fullName, username: await freeUsername(email.split("@")[0]!), role: "GENERAL_USER", locale: input.locale, tenantCode: await nextTenantCode() },
  });
  return { user: publicUser(user), isNew: true };
}

const publicUser = (u: { id: string; username: string; role: string; fullName: string; locale: string }) => ({
  id: u.id, username: u.username, role: u.role, fullName: u.fullName, locale: u.locale,
});
