/**
 * Lets you sign in as a newly registered user (a demo guest with no lease): they see Find Home, Marketplace and the
 * Subscription tab. Becoming a verified tenant hides the tab.
 *   npm run db:seed:user
 * Demo data on purpose: do not use these credentials anywhere real. Creates the demo user when it does not exist yet.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

export const DEMO_USER = { email: "demo.user1@example.com", username: "dm_guest1", fullName: "Nafisa Tabassum Oishi", password: "Demo@User2026" };

const db = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const u = (await db.user.findUnique({ where: { username: DEMO_USER.username } }))
    ?? (await db.user.create({ data: { username: DEMO_USER.username, fullName: DEMO_USER.fullName, role: "GENERAL_USER", status: "ACTIVE", locale: "en" } }));
  if (u.role !== "GENERAL_USER") throw new Error(`${DEMO_USER.username} is a ${u.role} now, not a new user.`);
  if (u.authId) { console.log(`Demo user can already sign in (${DEMO_USER.email}).`); return; }
  const { data, error } = await sb.auth.admin.createUser({ email: DEMO_USER.email, password: DEMO_USER.password, email_confirm: true });
  if (error) throw error;
  await db.user.update({ where: { id: u.id }, data: { authId: data.user.id, email: DEMO_USER.email, locale: "en" } });
  console.log(`Demo user ready: ${DEMO_USER.email} (${u.fullName}).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
