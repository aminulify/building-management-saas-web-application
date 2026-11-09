import { api, ApiError } from "./api-client";

/**
 * Browser session handling.
 *  - "Stay logged in" ticked → localStorage (survives closing the browser)
 *  - not ticked              → sessionStorage (ends with the tab)
 * Tokens are only ever sent to our own /api/v1. A refresh token renews the short-lived access token.
 */
const KEY = "ag.session";

export interface StoredSession { accessToken: string; refreshToken?: string; expiresAt?: number | null }

const read = (store: Storage): StoredSession | null => {
  try { return JSON.parse(store.getItem(KEY) ?? "null"); } catch { return null; }
};

export const getSession = (): StoredSession | null => {
  if (typeof window === "undefined") return null;
  try { return read(localStorage) ?? read(sessionStorage); } catch { return null; }
};

export const isRemembered = (): boolean => { try { return !!read(localStorage); } catch { return false; } };

export function setSession(s: StoredSession, remember = true) {
  clearSession();
  try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s)); } catch { /* private mode: stays in memory-less state */ }
}

export function clearSession() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Only same-site relative paths may be used as a post-login destination (no open redirects). */
export const safeNext = (next: string | null | undefined): string | null =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;

/** Dashboards are separate modules; until they exist everyone lands on the account page. */
export const POST_LOGIN_PATH = "/account";

/** Where each role will land once the dashboards are built (architecture §10). */
export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  GOV_ADMIN: "/gov/dashboard",
  OWNER: "/owner/dashboard",
  TENANT: "/tenant/dashboard",
  GENERAL_USER: "/user/dashboard",
};

interface Refreshed { session: StoredSession }

let refreshing: Promise<StoredSession | null> | null = null;

/** One refresh at a time even if several requests notice the expiry together. */
export function refreshStoredSession(): Promise<StoredSession | null> {
  refreshing ??= (async () => {
    const s = getSession();
    if (!s?.refreshToken) return null;
    try {
      const r = await api<Refreshed>("/auth/refresh", { method: "POST", body: { refreshToken: s.refreshToken } });
      setSession(r.session, isRemembered());
      return r.session;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clearSession();
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Calls the API as the signed-in user; renews the token when it is about to expire or the server says 401. */
export async function authApi<T>(path: string, opts: Parameters<typeof api>[1] = {}): Promise<T> {
  let s = getSession();
  if (!s) throw new ApiError(401, "UNAUTHENTICATED");
  const expMs = s.expiresAt ? s.expiresAt * 1000 : 0;
  if (expMs && expMs - Date.now() < 60_000) s = (await refreshStoredSession()) ?? s;
  try {
    return await api<T>(path, { ...opts, token: s.accessToken });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const fresh = await refreshStoredSession();
      if (fresh) return api<T>(path, { ...opts, token: fresh.accessToken });
      clearSession();
    }
    throw e;
  }
}
