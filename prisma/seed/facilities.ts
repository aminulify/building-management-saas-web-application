import type { PrismaClient } from "@prisma/client";

/** Starter points around the seeded zones so the nearby-facility filters work. Replace with the OSM import (module: geography seed). */
const FACILITIES: [string, string, string, number, number][] = [
  ["MOSQUE", "Uttara Sector 4 Jame Mosque", "উত্তরা সেক্টর ৪ জামে মসজিদ", 23.8685, 90.3998],
  ["SCHOOL", "Uttara High School", "উত্তরা হাই স্কুল", 23.8702, 90.4021],
  ["HOSPITAL", "Uttara Crescent Hospital", "উত্তরা ক্রিসেন্ট হাসপাতাল", 23.8668, 90.3979],
  ["MARKET", "Sector 4 Kitchen Market", "সেক্টর ৪ কিচেন মার্কেট", 23.8691, 90.4005],
  ["PARK", "Uttara Central Park", "উত্তরা সেন্ট্রাল পার্ক", 23.8721, 90.4046],
  ["MOSQUE", "Mirpur DOHS Mosque", "মিরপুর ডিওএইচএস মসজিদ", 23.8344, 90.3667],
  ["SCHOOL", "Mirpur DOHS School", "মিরপুর ডিওএইচএস স্কুল", 23.8362, 90.3689],
  ["MOSQUE", "Dhanmondi Baitul Aman Mosque", "ধানমন্ডি বায়তুল আমান মসজিদ", 23.7461, 90.3742],
  ["UNIVERSITY", "Dhaka College Area University", "ধানমন্ডি বিশ্ববিদ্যালয় এলাকা", 23.7389, 90.3835],
  ["HOSPITAL", "Dhanmondi General Hospital", "ধানমন্ডি জেনারেল হাসপাতাল", 23.7507, 90.3753],
  ["HIGHWAY", "Bashundhara Main Road", "বসুন্ধরা মূল সড়ক", 23.8103, 90.4318],
  ["PLAYGROUND", "Bashundhara Playground", "বসুন্ধরা খেলার মাঠ", 23.8135, 90.4291],
];

export async function seedFacilities(db: PrismaClient) {
  if ((await db.facility.count()) > 0) return;
  for (const [type, nameEn, nameBn, lat, lng] of FACILITIES) {
    await db.$executeRaw`INSERT INTO "Facility" (id, type, "nameEn", "nameBn", location) VALUES (gen_random_uuid(), ${type}::"FacilityType", ${nameEn}, ${nameBn}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`;
  }
}
