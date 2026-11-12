/**
 * Creates (or repairs) THE Super Admin: the one platform owner account.
 *   SUPER_ADMIN_EMAIL=… SUPER_ADMIN_PASSWORD=… npm run db:seed:admin
 * The credentials come from the environment only, they are never stored in the code. The app has no screen and no
 * API that can make another Super Admin (see `reserved` in auth/schema.ts), so this script is the only way in.
 * It also lists any other SUPER_ADMIN row so that nobody else keeps the access by accident.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;
const USERNAME = process.env.SUPER_ADMIN_USERNAME ?? "amaderghor";

const db = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function findAuthUser(mail: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === mail);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  if (!email || !password) throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.");

  let auth = await findAuthUser(email);
  if (!auth) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    auth = data.user;
    console.log("Supabase Auth account created.");
  } else {
    const { error } = await sb.auth.admin.updateUserById(auth.id, { password, email_confirm: true });
    if (error) throw error;
    console.log("Supabase Auth account already existed: password set again.");
  }

  const row = await db.user.findFirst({ where: { OR: [{ email }, { authId: auth.id }] } });
  const data = { authId: auth.id, email, role: "SUPER_ADMIN" as const, status: "ACTIVE" as const, verificationStatus: "VERIFIED" as const, archivedAt: null, locale: "en" };
  const admin = row
    ? await db.user.update({ where: { id: row.id }, data })
    : await db.user.create({ data: { ...data, username: USERNAME, fullName: USERNAME } });
  console.log(`Super Admin ready: ${admin.email} (@${admin.username}).`);

  const others = await db.user.findMany({ where: { role: "SUPER_ADMIN", id: { not: admin.id } }, select: { username: true, email: true } });
  if (others.length) console.log(`Warning: ${others.length} other SUPER_ADMIN row(s) exist (test leftovers?):`, others.map((o) => o.email ?? o.username).join(", "));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
