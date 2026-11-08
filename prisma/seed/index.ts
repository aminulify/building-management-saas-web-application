import { PrismaClient } from "@prisma/client";
import { seedPlans } from "./plans";
import { seedSettings } from "./settings";
import { seedGeo } from "./geo";
import { seedFacilities } from "./facilities";
import { seedCms } from "./cms";

const db = new PrismaClient();

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const authId = process.env.SEED_ADMIN_AUTH_ID;
  if (!email || !authId) {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_AUTH_ID not set, skipping Super Admin");
    return;
  }
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      authId,
      username: process.env.SEED_ADMIN_USERNAME ?? "superadmin",
      fullName: process.env.SEED_ADMIN_NAME ?? "Super Admin",
      role: "SUPER_ADMIN",
      verificationStatus: "VERIFIED",
    },
  });
}

async function main() {
  await seedPlans(db);
  await seedSettings(db);
  await seedGeo(db);
  await seedFacilities(db);
  await seedCms(db);
  await seedSuperAdmin();
  console.log("seed done");
}

main().finally(() => db.$disconnect());
