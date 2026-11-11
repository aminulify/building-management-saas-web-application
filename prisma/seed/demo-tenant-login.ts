/**
 * Lets you sign in as one of the demo tenants (the first demo tenant, who lives in the demo owner's building).
 *   npm run db:seed:tenant
 * Sign in at /en/login with the identifiers below. Demo data on purpose: do not use these credentials anywhere real.
 * Run `db:seed:demo` first.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

export const DEMO_TENANT = { email: "demo.tenant1@example.com", username: "demo_t1", password: "Demo@Tenant2026" };

const db = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const u = await db.user.findUnique({ where: { username: DEMO_TENANT.username } });
  if (!u) throw new Error("Demo tenant not found: run `npm run db:seed:demo` first.");
  if (u.authId) { console.log(`Demo tenant can already sign in (${DEMO_TENANT.email}).`); return; }
  const { data, error } = await sb.auth.admin.createUser({ email: DEMO_TENANT.email, password: DEMO_TENANT.password, email_confirm: true });
  if (error) throw error;
  await db.user.update({ where: { id: u.id }, data: { authId: data.user.id, email: DEMO_TENANT.email, locale: "en" } });
  console.log(`Demo tenant ready: ${DEMO_TENANT.email} (${u.fullName}).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
