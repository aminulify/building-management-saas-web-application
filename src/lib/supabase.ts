import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export const supabaseAnon = () => createClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, opts);

/** Server-only. Never import from client components. */
export const supabaseAdmin = () => createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, opts);
