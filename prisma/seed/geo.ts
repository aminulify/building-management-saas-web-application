import type { PrismaClient } from "@prisma/client";

/** Starter data only; the full division/district/upazila/zone import comes with the geography seed in module 13. */
const DATA = [
  { nameEn: "Dhaka", nameBn: "ঢাকা", districts: [
    { nameEn: "Dhaka", nameBn: "ঢাকা", upazilas: [
      { nameEn: "Mirpur", nameBn: "মিরপুর", zones: [{ nameEn: "Mirpur DOHS", nameBn: "মিরপুর ডিওএইচএস" }] },
      { nameEn: "Uttara", nameBn: "উত্তরা", zones: [{ nameEn: "Uttara Sector 4", nameBn: "উত্তরা সেক্টর ৪" }] },
      { nameEn: "Dhanmondi", nameBn: "ধানমন্ডি", zones: [{ nameEn: "Dhanmondi", nameBn: "ধানমন্ডি" }] },
      { nameEn: "Bashundhara", nameBn: "বসুন্ধরা", zones: [{ nameEn: "Bashundhara R/A", nameBn: "বসুন্ধরা আর/এ" }] },
    ] },
    { nameEn: "Keraniganj", nameBn: "কেরানীগঞ্জ", upazilas: [
      { nameEn: "Keraniganj", nameBn: "কেরানীগঞ্জ", zones: [{ nameEn: "Keraniganj", nameBn: "কেরানীগঞ্জ" }] },
    ] },
  ] },
];

export async function seedGeo(db: PrismaClient) {
  for (const d of DATA) {
    const div = await db.division.upsert({ where: { nameEn: d.nameEn }, update: {}, create: { nameEn: d.nameEn, nameBn: d.nameBn } });
    for (const di of d.districts) {
      const dist = await db.district.upsert({
        where: { divisionId_nameEn: { divisionId: div.id, nameEn: di.nameEn } },
        update: {}, create: { divisionId: div.id, nameEn: di.nameEn, nameBn: di.nameBn },
      });
      for (const u of di.upazilas) {
        const up = await db.upazila.upsert({
          where: { districtId_nameEn: { districtId: dist.id, nameEn: u.nameEn } },
          update: {}, create: { districtId: dist.id, nameEn: u.nameEn, nameBn: u.nameBn },
        });
        for (const z of u.zones) {
          await db.zone.upsert({
            where: { upazilaId_nameEn: { upazilaId: up.id, nameEn: z.nameEn } },
            update: {}, create: { upazilaId: up.id, ...z },
          });
        }
      }
    }
  }
}
