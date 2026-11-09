import type { PrismaClient } from "@prisma/client";
import { BD } from "./bd-districts";

/** Starter data only; the full division/district/upazila/zone import comes with the geography seed in module 13. */
const DATA = [
  { nameEn: "Dhaka", nameBn: "ঢাকা", districts: [
    { nameEn: "Dhaka", nameBn: "ঢাকা", upazilas: [
      { nameEn: "Mirpur", nameBn: "মিরপুর", zones: [{ nameEn: "Mirpur DOHS", nameBn: "মিরপুর ডিওএইচএস" }] },
      { nameEn: "Uttara", nameBn: "উত্তরা", zones: [{ nameEn: "Uttara Sector 4", nameBn: "উত্তরা সেক্টর ৪" }] },
      { nameEn: "Dhanmondi", nameBn: "ধানমন্ডি", zones: [{ nameEn: "Dhanmondi", nameBn: "ধানমন্ডি" }] },
      { nameEn: "Bashundhara", nameBn: "বসুন্ধরা", zones: [{ nameEn: "Bashundhara R/A", nameBn: "বসুন্ধরা আর/এ" }] },
      { nameEn: "Keraniganj", nameBn: "কেরানীগঞ্জ", zones: [{ nameEn: "Keraniganj", nameBn: "কেরানীগঞ্জ" }] },
      { nameEn: "Gulshan", nameBn: "গুলশান", zones: [] },
      { nameEn: "Mohammadpur", nameBn: "মোহাম্মদপুর", zones: [] },
      { nameEn: "Tejgaon", nameBn: "তেজগাঁও", zones: [] },
      { nameEn: "Savar", nameBn: "সাভার", zones: [] },
      { nameEn: "Dohar", nameBn: "দোহার", zones: [] },
      { nameEn: "Nawabganj", nameBn: "নবাবগঞ্জ", zones: [] },
      { nameEn: "Dhamrai", nameBn: "ধামরাই", zones: [] },
    ] },
  ] },
];

/** Keraniganj is an upazila of Dhaka district (an earlier seed wrongly made it a district). Move it, then drop the bad row. */
async function fixKeraniganj(db: PrismaClient) {
  const dhaka = await db.division.findUnique({ where: { nameEn: "Dhaka" } });
  if (!dhaka) return;
  const wrong = await db.district.findUnique({ where: { divisionId_nameEn: { divisionId: dhaka.id, nameEn: "Keraniganj" } }, include: { upazilas: true } });
  const right = await db.district.findUnique({ where: { divisionId_nameEn: { divisionId: dhaka.id, nameEn: "Dhaka" } } });
  if (!wrong || !right) return;
  for (const u of wrong.upazilas) await db.upazila.update({ where: { id: u.id }, data: { districtId: right.id } });
  await db.district.delete({ where: { id: wrong.id } });
}

/** All 8 divisions and 64 districts, so the sign-up address pickers are complete. */
async function seedAllDistricts(db: PrismaClient) {
  for (const d of BD) {
    const div = await db.division.upsert({ where: { nameEn: d.en }, update: { nameBn: d.bn }, create: { nameEn: d.en, nameBn: d.bn } });
    for (const [en, bn] of d.districts) {
      await db.district.upsert({ where: { divisionId_nameEn: { divisionId: div.id, nameEn: en } }, update: { nameBn: bn }, create: { divisionId: div.id, nameEn: en, nameBn: bn } });
    }
  }
}

export async function seedGeo(db: PrismaClient) {
  await seedAllDistricts(db);
  await fixKeraniganj(db);
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
