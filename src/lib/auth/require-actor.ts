import { createClient } from "@supabase/supabase-js";
import type { Role, User } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError } from "../errors";

export interface Actor {
  id: string;
  role: Role;
  username: string;
  fullName: string;
}

/**
 * Session + User row. Role and status come from our DB, never from JWT claims alone.
 * Rejects missing/invalid tokens (401) and non-ACTIVE accounts (403).
 */
export async function requireActor(req: Request): Promise<Actor> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError("UNAUTHENTICATED");

  const supabase = createClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError("UNAUTHENTICATED");

  const user = await db.user.findUnique({ where: { authId: data.user.id } });
  if (!user) throw new AppError("UNAUTHENTICATED");
  return toActor(user);
}

/** For public endpoints that behave differently when signed in. Invalid/missing token → null. */
export async function optionalActor(req: Request): Promise<Actor | null> {
  if (!req.headers.get("authorization")) return null;
  try {
    return await requireActor(req);
  } catch {
    return null;
  }
}

export function toActor(user: Pick<User, "id" | "role" | "status" | "username" | "fullName">): Actor {
  if (user.status !== "ACTIVE") throw new AppError("ACCOUNT_SUSPENDED");
  return { id: user.id, role: user.role, username: user.username, fullName: user.fullName };
}
