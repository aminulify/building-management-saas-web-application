import type { PrismaClient } from "@prisma/client";

const SETTINGS = [
  { key: "payment.bkash.personalNumber", value: "01686621361" },
  { key: "billing.graceDays", value: 3 },
  { key: "sos.onDutyPhones", value: [] },
  { key: "marketplace.nearbyRangeM", value: 1000 },
  { key: "marketplace.requireOwnershipDocs", value: false },
  { key: "platform.name", value: "AmaderGhor" },
  { key: "platform.defaultLanguage", value: "bn" },
  { key: "platform.languages", value: ["bn", "en"] },
  { key: "platform.currency", value: "BDT" },
  { key: "platform.timezone", value: "Asia/Dhaka" },
];

export async function seedSettings(db: PrismaClient) {
  for (const s of SETTINGS) {
    await db.platformSetting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
}
