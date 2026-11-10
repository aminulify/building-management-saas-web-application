/**
 * Demo homes for the Find Home page: 4 verified sellers and 18 published listings (15 to rent, 3 to buy) in real
 * Bangladesh places (names spelt exactly as the open geo API spells them), each with 3 generated pictures.
 *   npm run db:seed:listings            create them (skips if they exist)
 *   npm run db:seed:listings -- --reset delete them and create them again
 *   npm run db:seed:listings -- --clear delete them and stop (only real data stays)
 * Sellers are fictional (usernames demo_l1..4, phones 01700000xxx, e-mails on example.com) and cannot sign in.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, type ListingCategory, type Furnishing } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { LANDLORDS } from "./demo-data/people";
import { avatarPng, propertyJpeg } from "./demo-data/images";

const db = new PrismaClient();
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BUCKET = "amaderghor-private";

interface Place { division: string; district: string; upazila: string; unionName: string; postal: string; lat: number; lng: number }
const P = {
  hazratpur: { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj", unionName: "Hazratpur", postal: "1311", lat: 23.7036, lng: 90.3722 },
  kalatia: { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj", unionName: "Kalatia", postal: "1310", lat: 23.6858, lng: 90.3398 },
  ruhitpur: { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj", unionName: "Ruhitpur", postal: "1312", lat: 23.6527, lng: 90.3401 },
  birulia: { division: "Dhaka", district: "Dhaka", upazila: "Savar", unionName: "Birulia", postal: "1340", lat: 23.8269, lng: 90.3318 },
  ashulia: { division: "Dhaka", district: "Dhaka", upazila: "Savar", unionName: "Ashulia", postal: "1341", lat: 23.8939, lng: 90.3105 },
  savar: { division: "Dhaka", district: "Dhaka", upazila: "Savar", unionName: "Savar", postal: "1340", lat: 23.8583, lng: 90.2667 },
  gazipur: { division: "Dhaka", district: "Gazipur", upazila: "Gazipur Sadar", unionName: "Konabari", postal: "1700", lat: 23.9999, lng: 90.4203 },
  sonargaon: { division: "Dhaka", district: "Narayanganj", upazila: "Sonargaon", unionName: "Baidyer Bazar", postal: "1440", lat: 23.6504, lng: 90.6012 },
  sitakunda: { division: "Chattagram", district: "Chattogram", upazila: "Sitakunda", unionName: "Barabkunda", postal: "4310", lat: 22.6134, lng: 91.6644 },
} satisfies Record<string, Place>;

interface Seed { seller: number; place: keyof typeof P; type: "RENT" | "SALE"; category: ListingCategory; title: string; price: number; beds: number; baths: number; balconies: number; sqft: number; floor: number; floors: number; furnishing: Furnishing; amenities: string[]; near: [string, number][]; address: string; ago: number; hue: number }
const NEAR = (h: number, p: number, m: number, s: number, k: number): [string, number][] => [["HOSPITAL", h], ["PARK", p], ["MOSQUE", m], ["SCHOOL", s], ["MARKET", k]];

const SEEDS: Seed[] = [
  { seller: 0, place: "hazratpur", type: "RENT", category: "FLAT", title: "Bright 3-bed family flat near Hazratpur Bazar", price: 25000, beds: 3, baths: 2, balconies: 2, sqft: 1250, floor: 4, floors: 6, furnishing: "SEMI_FURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "GENERATOR"], near: NEAR(700, 900, 150, 400, 300), address: "House 12, Road 3, Hazratpur Bazar Road", ago: 1, hue: 200 },
  { seller: 0, place: "hazratpur", type: "RENT", category: "APARTMENT", title: "Modern 2-bed apartment with open balcony", price: 18000, beds: 2, baths: 2, balconies: 1, sqft: 950, floor: 2, floors: 5, furnishing: "UNFURNISHED", amenities: ["SECURITY", "MOSQUE"], near: NEAR(1500, 600, 120, 700, 500), address: "Plot 7, Block B, Hazratpur", ago: 3, hue: 160 },
  { seller: 1, place: "kalatia", type: "RENT", category: "FLAT", title: "Spacious 3-bed flat with parking, Kalatia", price: 28000, beds: 3, baths: 3, balconies: 2, sqft: 1500, floor: 3, floors: 7, furnishing: "SEMI_FURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "CCTV", "GATED"], near: NEAR(900, 400, 200, 500, 600), address: "House 45, Kalatia Main Road", ago: 2, hue: 20 },
  { seller: 1, place: "kalatia", type: "RENT", category: "STUDIO", title: "Compact studio for a single professional", price: 11000, beds: 1, baths: 1, balconies: 1, sqft: 520, floor: 5, floors: 8, furnishing: "FURNISHED", amenities: ["SECURITY", "LIFT", "CCTV"], near: NEAR(1800, 1200, 300, 900, 250), address: "Tower 2, Kalatia Bazar", ago: 5, hue: 280 },
  { seller: 2, place: "ruhitpur", type: "RENT", category: "FLAT", title: "Quiet 2-bed flat beside the park", price: 16500, beds: 2, baths: 1, balconies: 1, sqft: 880, floor: 1, floors: 4, furnishing: "UNFURNISHED", amenities: ["PARK", "SECURITY"], near: NEAR(2400, 180, 250, 600, 900), address: "Ruhitpur Park Road", ago: 6, hue: 120 },
  { seller: 2, place: "birulia", type: "RENT", category: "DUPLEX", title: "Premium 4-bed duplex with generator backup", price: 55000, beds: 4, baths: 4, balconies: 3, sqft: 2400, floor: 6, floors: 7, furnishing: "FURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "GENERATOR", "CCTV", "GATED", "SECURITY_GUARD"], near: NEAR(800, 500, 350, 600, 700), address: "Sector 4, Birulia", ago: 1, hue: 340 },
  { seller: 3, place: "birulia", type: "RENT", category: "FLAT", title: "Family flat close to the hospital, Birulia", price: 22000, beds: 3, baths: 2, balconies: 2, sqft: 1180, floor: 3, floors: 5, furnishing: "SEMI_FURNISHED", amenities: ["SECURITY", "PARKING", "HOSPITAL"], near: NEAR(350, 1100, 200, 450, 400), address: "Birulia Hospital Road", ago: 4, hue: 190 },
  { seller: 3, place: "ashulia", type: "RENT", category: "APARTMENT", title: "Affordable 2-bed apartment for small families", price: 14000, beds: 2, baths: 1, balconies: 1, sqft: 820, floor: 2, floors: 4, furnishing: "UNFURNISHED", amenities: ["SECURITY", "MOSQUE", "MARKET"], near: NEAR(2000, 1500, 90, 800, 150), address: "Ashulia Bazar, Block C", ago: 9, hue: 90 },
  { seller: 0, place: "savar", type: "RENT", category: "COMMERCIAL", title: "Ground-floor shop space on a busy road", price: 45000, beds: 0, baths: 1, balconies: 0, sqft: 900, floor: 1, floors: 4, furnishing: "UNFURNISHED", amenities: ["SECURITY", "CCTV", "MARKET"], near: NEAR(900, 1500, 200, 700, 60), address: "Savar Bazar Stand", ago: 7, hue: 40 },
  { seller: 1, place: "gazipur", type: "RENT", category: "FLAT", title: "3-bed flat with security, near the highway", price: 20000, beds: 3, baths: 2, balconies: 2, sqft: 1100, floor: 2, floors: 5, furnishing: "SEMI_FURNISHED", amenities: ["SECURITY", "PARKING", "HIGHWAY"], near: NEAR(1300, 900, 180, 500, 400), address: "Konabari, Gazipur", ago: 8, hue: 240 },
  { seller: 2, place: "sonargaon", type: "RENT", category: "DUPLEX", title: "Garden duplex with large balcony", price: 38000, beds: 3, baths: 3, balconies: 3, sqft: 1900, floor: 4, floors: 4, furnishing: "SEMI_FURNISHED", amenities: ["PARKING", "SECURITY", "GENERATOR", "PARK"], near: NEAR(1700, 250, 300, 800, 900), address: "Baidyer Bazar Road", ago: 11, hue: 140 },
  { seller: 3, place: "sitakunda", type: "RENT", category: "APARTMENT", title: "Sea-breeze 2-bed apartment, Sitakunda", price: 17000, beds: 2, baths: 2, balconies: 2, sqft: 900, floor: 5, floors: 6, furnishing: "SEMI_FURNISHED", amenities: ["SECURITY", "LIFT", "MOSQUE"], near: NEAR(1900, 800, 140, 600, 500), address: "Barabkunda Bazar", ago: 13, hue: 210 },
  { seller: 0, place: "hazratpur", type: "RENT", category: "STUDIO", title: "Budget studio, walking distance to the mosque", price: 8500, beds: 1, baths: 1, balconies: 0, sqft: 400, floor: 1, floors: 4, furnishing: "UNFURNISHED", amenities: ["MOSQUE", "SECURITY"], near: NEAR(1600, 1400, 60, 800, 350), address: "Hazratpur Jame Mosque Lane", ago: 15, hue: 70 },
  { seller: 1, place: "kalatia", type: "RENT", category: "FLAT", title: "Large 4-bed flat for joint families", price: 42000, beds: 4, baths: 3, balconies: 3, sqft: 2100, floor: 4, floors: 8, furnishing: "SEMI_FURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "GENERATOR", "SECURITY_GUARD"], near: NEAR(600, 450, 250, 350, 500), address: "Kalatia Residential Area", ago: 18, hue: 310 },
  { seller: 3, place: "birulia", type: "RENT", category: "FLAT", title: "2-bed flat near school and park", price: 19500, beds: 2, baths: 2, balconies: 1, sqft: 960, floor: 3, floors: 6, furnishing: "UNFURNISHED", amenities: ["SECURITY", "PARK", "SCHOOL"], near: NEAR(1700, 220, 300, 160, 500), address: "Birulia School Road", ago: 20, hue: 180 },
  { seller: 0, place: "hazratpur", type: "SALE", category: "FLAT", title: "Ready 3-bed flat for sale, South Keraniganj", price: 5800000, beds: 3, baths: 2, balconies: 2, sqft: 1350, floor: 5, floors: 8, furnishing: "UNFURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "GENERATOR"], near: NEAR(800, 700, 200, 500, 400), address: "Hazratpur Housing, Block A", ago: 10, hue: 15 },
  { seller: 2, place: "birulia", type: "SALE", category: "DUPLEX", title: "Corner duplex for sale with rooftop garden", price: 14500000, beds: 4, baths: 4, balconies: 3, sqft: 2600, floor: 7, floors: 7, furnishing: "SEMI_FURNISHED", amenities: ["PARKING", "SECURITY", "LIFT", "GENERATOR", "CCTV", "GATED"], near: NEAR(900, 400, 300, 700, 800), address: "Sector 2, Birulia", ago: 14, hue: 330 },
  { seller: 1, place: "savar", type: "SALE", category: "APARTMENT", title: "Investor-friendly 2-bed apartment, Savar", price: 3900000, beds: 2, baths: 2, balconies: 1, sqft: 980, floor: 3, floors: 6, furnishing: "UNFURNISHED", amenities: ["SECURITY", "LIFT"], near: NEAR(1000, 1300, 250, 600, 350), address: "Savar Cantonment Road", ago: 16, hue: 100 },
];

async function wipe() {
  const sellers = await db.user.findMany({ where: { username: { startsWith: "demo_l" } }, select: { id: true } });
  const ids = sellers.map((s) => s.id);
  if (!ids.length) return;
  const ls = await db.listing.findMany({ where: { sellerId: { in: ids } }, select: { id: true, images: { select: { storageKey: true } } } });
  const listingIds = ls.map((l) => l.id);
  const keys = ls.flatMap((l) => l.images.map((i) => i.storageKey));
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { avatarKey: true } });
  const convs = (await db.conversationParticipant.findMany({ where: { userId: { in: ids } }, select: { conversationId: true } })).map((c) => c.conversationId);
  await db.message.deleteMany({ where: { conversationId: { in: convs } } });
  await db.conversationParticipant.deleteMany({ where: { conversationId: { in: convs } } });
  await db.conversation.deleteMany({ where: { id: { in: convs } } });
  await db.visitRequest.deleteMany({ where: { OR: [{ listingId: { in: listingIds } }, { sellerId: { in: ids } }] } });
  await db.favorite.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listingReport.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listingStatDaily.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listingFacilityDistance.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listingImage.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.ownerProfile.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  const remove = [...keys, ...users.map((u) => u.avatarKey).filter((k): k is string => !!k)];
  if (remove.length) await sb.storage.from(BUCKET).remove(remove);
}

async function put(key: string, body: Buffer, contentType: string) {
  const { error } = await sb.storage.from(BUCKET).upload(key, body, { contentType, upsert: true });
  if (error) throw error;
}

async function main() {
  if (process.argv.includes("--clear")) { await wipe(); console.log("Demo listings and their fake sellers removed."); return; }
  if (process.argv.includes("--reset")) await wipe();
  else if (await db.user.findUnique({ where: { username: "demo_l1" } })) { console.log("Demo listings already exist. Use --reset to rebuild them."); return; }

  const sellers: string[] = [];
  for (const [i, p] of LANDLORDS.slice(0, 4).entries()) {
    const id = randomUUID();
    const avatarKey = `avatar/${id}/${randomUUID()}.png`;
    await put(avatarKey, await avatarPng(i * 70 + 10, p.gender === "FEMALE"), "image/png");
    const [{ n }] = await db.$queryRaw<{ n: string }[]>`SELECT nextval('owner_code_seq')::text AS n`;
    await db.user.create({ data: { id, username: `demo_l${i + 1}`, fullName: p.fullName, email: `demo.landlord${i + 1}@example.com`, phone: `0170000010${i}`, role: "OWNER", verificationStatus: "VERIFIED", locale: p.locale, ownerCode: `OW${n}`, avatarKey, occupation: p.occupation, gender: p.gender } });
    await db.ownerProfile.create({ data: { userId: id } });
    sellers.push(id);
  }

  for (const [idx, s] of SEEDS.entries()) {
    const pl = P[s.place] as Place;
    const created = new Date(Date.now() - s.ago * 86400_000 - idx * 60_000);
    const l = await db.listing.create({
      data: {
        sellerId: sellers[s.seller]!, type: s.type, category: s.category, title: s.title, price: s.price, negotiable: idx % 3 === 0,
        description: `${s.title}. ${s.beds ? `${s.beds} bedrooms, ` : ""}${s.baths} bathrooms and ${s.balconies} balcon${s.balconies === 1 ? "y" : "ies"} on floor ${s.floor} of ${s.floors}. ${s.furnishing === "FURNISHED" ? "Fully furnished." : s.furnishing === "SEMI_FURNISHED" ? "Semi-furnished with wardrobes and kitchen cabinets." : "Unfurnished, ready to move in."} Gas, water and electricity connected; caretaker on site.`,
        area: s.sqft, areaUnit: "SQFT", bedrooms: s.beds || null, bathrooms: s.baths, balconies: s.balconies, floor: s.floor, totalFloors: s.floors, furnishing: s.furnishing,
        amenities: s.amenities, status: "PUBLISHED", declaration: true, fullAddress: `${s.address}, ${pl.unionName}, ${pl.upazila}, ${pl.district} - ${pl.postal}`,
        division: pl.division, district: pl.district, upazila: pl.upazila, unionName: pl.unionName, postalCode: pl.postal,
        availableFrom: new Date(Date.now() + 7 * 86400_000), createdAt: created,
      },
    });
    // tiny, repeatable offset so pins of one area do not sit on top of each other
    const lat = pl.lat + ((idx * 37) % 21 - 10) * 0.0004, lng = pl.lng + ((idx * 53) % 21 - 10) * 0.0004;
    await db.$executeRawUnsafe(`UPDATE "Listing" SET "location" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3::uuid`, lng, lat, l.id);
    await db.listingFacilityDistance.createMany({ data: s.near.map(([facilityType, distanceM]) => ({ listingId: l.id, facilityType: facilityType as never, distanceM })) });
    for (const k of [0, 1, 2] as const) {
      const key = `listing-image/${sellers[s.seller]}/${randomUUID()}.jpg`;
      await put(key, await propertyJpeg(s.hue, s.floors, k), "image/jpeg");
      await db.listingImage.create({ data: { listingId: l.id, storageKey: key, order: k } });
    }
  }
  console.log(`Created ${sellers.length} sellers and ${SEEDS.length} published listings.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
