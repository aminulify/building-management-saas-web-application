import type { PrismaClient } from "@prisma/client";

/** Caps per architecture D1/D3. Prices from CLAUDE.md: 159 / 299 / 699 BDT monthly. */
const PLANS = [
  { code: "PRIMARY", nameBn: "প্রাইমারি", nameEn: "Primary", monthlyPrice: 159, propertyLimit: 2, unitLimit: 40, listingLimit: 5,
    features: { rentTracking: "basic", maintenance: "basic", rentAnalytics: "basic" } },
  { code: "MILLIONAIRE", nameBn: "মিলিয়নেয়ার", nameEn: "Millionaire", monthlyPrice: 299, propertyLimit: 4, unitLimit: 160, listingLimit: 15,
    features: { rentTracking: "advanced", maintenance: "advanced", rentAnalytics: "advanced" } },
  { code: "BILLIONAIRE", nameBn: "বিলিয়নেয়ার", nameEn: "Billionaire", monthlyPrice: 699, propertyLimit: 12, unitLimit: 500, listingLimit: 50,
    features: { rentTracking: "super", maintenance: "smart", rentAnalytics: "advanced" } },
];

export async function seedPlans(db: PrismaClient) {
  for (const p of PLANS) {
    await db.subscriptionPlan.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, audience: "OWNER", quarterlyDiscount: 10, yearlyDiscount: 20 },
    });
  }
}
