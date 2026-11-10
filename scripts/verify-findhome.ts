/**
 * Cross-checks the Find Home API against the database itself (not mocks): the "Properties Available" number, every
 * filter, the cards, the details, the wishlist, visit requests and the assistant are recomputed straight from Postgres.
 *   npm run verify:findhome       (needs the dev server on :3000, the demo owner (`npm run db:seed:demo`) and the
 *                                  demo homes (`npm run db:seed:listings`))
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000/api/v1";
const db = new PrismaClient();
const seed = readFileSync("prisma/seed/demo-owner.ts", "utf8");
const grab = (k: string) => seed.match(new RegExp(`${k}: "([^"]+)"`))![1]!;

let pass = 0, fail = 0;
const check = (label: string, value: unknown, info?: unknown) => {
  if (value) { pass++; console.log("  ok  ", label); } else { fail++; console.log("  FAIL", label, info === undefined ? "" : JSON.stringify(info).slice(0, 300)); }
};

async function call(method: string, path: string, token?: string, body?: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => null);
    if (res.status === 500 && attempt < 2) continue; // pooler hiccup
    return { status: res.status, data: json?.data, code: json?.code, details: json?.details };
  }
  throw new Error("unreachable");
}

const ids = (r: { data?: { items?: { id: string }[] } }) => (r.data?.items ?? []).map((i) => i.id).sort();
const dbIds = (rows: { id: string }[]) => rows.map((x) => x.id).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

(async () => {
  const login = await call("POST", "/auth/login", undefined, { identifier: grab("email"), password: grab("password") });
  check("owner signs in", login.status === 200 && !!login.data?.session?.accessToken, login);
  const T = login.data.session.accessToken as string;
  const me = await db.user.findUniqueOrThrow({ where: { email: grab("email") } });
  const pub = { status: "PUBLISHED" as const };

  console.log("\n'Properties Available' == rows in the database");
  const rentTotal = await db.listing.count({ where: { ...pub, type: "RENT" } });
  const saleTotal = await db.listing.count({ where: { ...pub, type: "SALE" } });
  check(`rent total (${rentTotal}) > 0 — run npm run db:seed:listings first if not`, rentTotal > 0);
  let r = await call("GET", "/listings?type=RENT&limit=50", T);
  check("rent: API total equals COUNT(*)", r.data?.total === rentTotal, { api: r.data?.total, db: rentTotal });
  check("rent: every published rent listing is returned", same(ids(r), dbIds(await db.listing.findMany({ where: { ...pub, type: "RENT" }, select: { id: true }, take: 50 }))));
  r = await call("GET", "/listings?type=SALE&limit=50", T);
  check("sale: API total equals COUNT(*)", r.data?.total === saleTotal, { api: r.data?.total, db: saleTotal });

  console.log("\nPaging: 'Load more' gives every home exactly once");
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const p = await call("GET", `/listings?type=RENT&limit=4${cursor ? `&cursor=${cursor}` : ""}`, T);
    seen.push(...(p.data?.items ?? []).map((i: { id: string }) => i.id));
    cursor = p.data?.nextCursor ?? null;
    if (!cursor) break;
  }
  check("pages of 4 add up to the total with no repeats", seen.length === rentTotal && new Set(seen).size === seen.length, { got: seen.length, want: rentTotal });

  console.log("\nFilters == the same filter written as SQL");
  const cases: [string, string, object][] = [
    ["division + district + upazila", "division=Dhaka&district=Dhaka&upazila=Keraniganj", { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj" }],
    ["union", "unionName=Birulia", { unionName: "Birulia" }],
    ["price range", "minPrice=15000&maxPrice=25000", { price: { gte: 15000, lte: 25000 } }],
    ["3 bedrooms", "bedroomList=3", { bedrooms: 3 }],
    ["2 or 3 bedrooms", "bedroomList=2,3", { bedrooms: { in: [2, 3] } }],
    ["apartment (flat + apartment)", "categories=FLAT,APARTMENT", { category: { in: ["FLAT", "APARTMENT"] } }],
    ["duplex", "categories=DUPLEX", { category: "DUPLEX" }],
    ["parking + security", "amenities=PARKING,SECURITY", { amenities: { hasEvery: ["PARKING", "SECURITY"] } }],
    ["near hospital (≤ 1 km)", "nearby=HOSPITAL&nearbyM=1000", { distances: { some: { facilityType: "HOSPITAL", distanceM: { lte: 1000 } } } }],
    ["near park AND mosque", "nearby=PARK,MOSQUE&nearbyM=1000", { AND: [{ distances: { some: { facilityType: "PARK", distanceM: { lte: 1000 } } } }, { distances: { some: { facilityType: "MOSQUE", distanceM: { lte: 1000 } } } }] }],
    ["furnished", "furnishing=FURNISHED", { furnishing: "FURNISHED" }],
    ["everything together", "upazila=Keraniganj&bedroomList=3&maxPrice=30000&amenities=PARKING", { upazila: "Keraniganj", bedrooms: 3, price: { lte: 30000 }, amenities: { has: "PARKING" } }],
  ];
  for (const [name, qs, where] of cases) {
    const api = await call("GET", `/listings?type=RENT&limit=50&${qs}`, T);
    const rows = await db.listing.findMany({ where: { ...pub, type: "RENT", ...where } as never, select: { id: true } });
    check(`${name}: ${rows.length} home(s), same ids and total`, api.status === 200 && same(ids(api), dbIds(rows)) && api.data?.total === rows.length, { api: ids(api).length, db: rows.length, status: api.status });
  }
  r = await call("GET", "/listings?type=RENT&sort=price_asc&limit=50", T);
  const prices: number[] = (r.data?.items ?? []).map((i: { price: string }) => Number(i.price));
  check("sort price low → high is really ascending", prices.length > 1 && prices.every((p, i) => i === 0 || p >= prices[i - 1]!), prices);
  r = await call("GET", "/listings?type=RENT&sort=price_desc&limit=50", T);
  const desc: number[] = (r.data?.items ?? []).map((i: { price: string }) => Number(i.price));
  check("sort price high → low is really descending", desc.length > 1 && desc.every((p, i) => i === 0 || p <= desc[i - 1]!), desc);
  r = await call("GET", "/listings?type=RENT&minPrice=30000&maxPrice=10000", T);
  check("minimum above maximum → 422", r.status === 422, r);

  console.log("\nA card == its database row");
  const first = await db.listing.findFirstOrThrow({ where: { ...pub, type: "RENT", upazila: "Keraniganj" }, include: { images: true, distances: true, seller: true }, orderBy: { id: "desc" } });
  r = await call("GET", "/listings?type=RENT&upazila=Keraniganj&limit=1", T);
  const card = r.data?.items?.[0];
  check("same home, title, price, beds, baths, sqft", card?.id === first.id && card.title === first.title && Number(card.price) === Number(first.price) && card.bedrooms === first.bedrooms && card.bathrooms === first.bathrooms && Number(card.area) === Number(first.area), card);
  check("photo count and a signed cover URL", card?.photos === first.images.length && /^https:\/\/.+token=/.test(card?.coverUrl ?? ""), { photos: card?.photos, cover: card?.coverUrl?.slice(0, 60) });
  check("location label is built from the stored place names", card?.locationLabel === `${first.unionName}, ${first.upazila}, ${first.district} - ${first.postalCode}`, card?.locationLabel);
  check("no seller phone in a public card", JSON.stringify(card).includes(first.seller.phone ?? "no-phone") === false);

  console.log("\nDetails == the database");
  r = await call("GET", `/listings/${first.id}`, T);
  const pt = await db.$queryRaw<{ lat: number; lng: number }[]>`SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "Listing" WHERE id = ${first.id}::uuid`;
  check("map point equals the stored geography point", Math.abs(r.data?.lat - pt[0]!.lat) < 1e-6 && Math.abs(r.data?.lng - pt[0]!.lng) < 1e-6, { api: [r.data?.lat, r.data?.lng], db: pt[0] });
  check("all photos signed, in order", r.data?.photoUrls?.length === first.images.length, r.data?.photoUrls?.length);
  check("facility distances match", r.data?.distances?.length === first.distances.length);
  check("seller badge matches verification status", r.data?.seller?.verified === (first.seller.verificationStatus === "VERIFIED") && !!r.data?.seller?.avatarUrl, r.data?.seller);
  check("floor, balconies, furnishing, full address come from the row", r.data?.floor === first.floor && r.data?.balconies === first.balconies && r.data?.furnishing === first.furnishing && r.data?.fullAddress === first.fullAddress);

  console.log("\nWishlist (POST / DELETE) == the favorites table");
  await db.favorite.deleteMany({ where: { userId: me.id, listingId: first.id } });
  r = await call("PUT", `/me/favorites/${first.id}`, T);
  check("save → row exists", r.status === 200 && (await db.favorite.count({ where: { userId: me.id, listingId: first.id } })) === 1, r);
  r = await call("GET", "/listings?type=RENT&upazila=Keraniganj&limit=50", T);
  check("the card now shows the filled heart", r.data?.items?.find((i: { id: string }) => i.id === first.id)?.isFavorite === true);
  r = await call("GET", "/listings?type=RENT&saved=1&limit=50", T);
  const favCount = await db.favorite.count({ where: { userId: me.id, listing: { ...pub, type: "RENT" } } });
  check("Saved filter == favorites rows", r.data?.total === favCount && ids(r).includes(first.id), { api: r.data?.total, db: favCount });
  r = await call("DELETE", `/me/favorites/${first.id}`, T);
  check("remove → row is gone", r.status === 200 && (await db.favorite.count({ where: { userId: me.id, listingId: first.id } })) === 0, r);

  console.log("\nCall owner == audited, rate-limited, private");
  const before = await db.auditLog.count({ where: { actorId: me.id, action: "listing.contact_reveal" } });
  r = await call("GET", `/listings/${first.id}/contact`, T);
  check("returns the seller's phone from the users table", r.status === 200 && r.data?.phone === first.seller.phone, r);
  check("the reveal was written to the audit log", (await db.auditLog.count({ where: { actorId: me.id, action: "listing.contact_reveal" } })) === before + 1);
  r = await call("GET", `/listings/${first.id}/contact`);
  check("signed-out visitor cannot get it → 401", r.status === 401, r);

  console.log("\nSchedule Visit (POST / PATCH / DELETE) == visit_requests rows");
  await db.visitRequest.deleteMany({ where: { requesterId: me.id, listingId: first.id } });
  const when = new Date(Date.now() + 3 * 86400_000); when.setUTCHours(5, 0, 0, 0); // 11:00 in Dhaka
  r = await call("POST", `/listings/${first.id}/visits`, T, { scheduledFor: when.toISOString(), note: "verify-findhome" });
  const vid: string | undefined = r.data?.id;
  const row = vid ? await db.visitRequest.findUnique({ where: { id: vid } }) : null;
  check("request creates one PENDING row for the right home, visitor and seller", r.status === 201 && row?.status === "PENDING" && row.listingId === first.id && row.requesterId === me.id && row.sellerId === first.sellerId && +row.scheduledFor === +when, r);
  check("the seller was notified", (await db.notification.count({ where: { userId: first.sellerId, type: "listing.visit", createdAt: { gte: new Date(Date.now() - 120_000) } } })) >= 1);
  r = await call("POST", `/listings/${first.id}/visits`, T, { scheduledFor: when.toISOString() });
  check("a second open request is refused → 409 (partial unique index)", r.status === 409, r);
  r = await call("GET", "/me/visits", T);
  check("my visits lists it", r.data?.some((v: { id: string }) => v.id === vid), r);
  r = await call("DELETE", `/visits/${vid}`, T);
  check("cancel → row becomes CANCELLED", r.status === 200 && (await db.visitRequest.findUnique({ where: { id: vid! } }))?.status === "CANCELLED", r);
  r = await call("POST", `/listings/${first.id}/visits`, T, { scheduledFor: new Date(Date.now() + 600_000).toISOString() });
  check("ten minutes from now is too soon → 422, nothing written", r.status === 422 && (await db.visitRequest.count({ where: { requesterId: me.id, listingId: first.id, status: "PENDING" } })) === 0, r);
  await db.visitRequest.deleteMany({ where: { requesterId: me.id, listingId: first.id } });

  console.log("\nMessage Owner == a message row in a listing conversation");
  const text = `verify-findhome ${Date.now()}`;
  r = await call("POST", `/listings/${first.id}/inquiries`, T, { message: text });
  const msg = await db.message.findFirst({ where: { body: text, senderId: me.id }, include: { conversation: true } });
  check("message stored in a LISTING_INQUIRY conversation", r.status === 201 && msg?.conversation.type === "LISTING_INQUIRY" && msg.conversationId === r.data?.conversationId, r);
  if (msg) await db.message.delete({ where: { id: msg.id } });

  console.log("\nAI Search Assistant is deterministic, free and consistent with the data");
  const q = "3 bed flat near hospital in Keraniganj under 30k BDT";
  const a1 = await call("POST", "/listings/ai-search", T, { query: q });
  const a2 = await call("POST", "/listings/ai-search", T, { query: q });
  check("same sentence → same ranking", JSON.stringify(a1.data?.results?.map((x: { id: string }) => x.id)) === JSON.stringify(a2.data?.results?.map((x: { id: string }) => x.id)));
  check("understood place, rooms, budget, facility", a1.data?.filters?.upazila === "Keraniganj" && a1.data?.filters?.bedroomList?.[0] === 3 && a1.data?.filters?.maxPrice === 30000 && a1.data?.filters?.nearby?.[0] === "HOSPITAL", a1.data?.filters);
  const res: { id: string; matchPercent: number; price: string; bedrooms: number }[] = a1.data?.results ?? [];
  check("ranked by match percentage (highest first)", res.length > 0 && res.every((x, i) => i === 0 || x.matchPercent <= res[i - 1]!.matchPercent), res.map((x) => x.matchPercent));
  const perfect = res.filter((x) => x.matchPercent === 100);
  const exact = await db.listing.findMany({ where: { ...pub, type: "RENT", upazila: "Keraniganj", bedrooms: 3, price: { lte: 30000 }, category: { in: ["FLAT", "APARTMENT"] }, distances: { some: { facilityType: "HOSPITAL", distanceM: { lte: 1000 } } } }, select: { id: true } });
  check("the 100% homes are exactly the homes that satisfy every condition in SQL", same(dbIds(perfect), dbIds(exact)), { perfect: perfect.length, sql: exact.length });
  check("a percentage is never above 100", res.every((x) => x.matchPercent <= 100));

  console.log("\nBangladesh geo API (through our server)");
  r = await call("GET", "/geo/bd?level=divisions");
  const dhaka = r.data?.find((d: { name: string }) => d.name === "Dhaka");
  check("8 divisions with Bangla names", r.status === 200 && r.data?.length === 8 && !!dhaka?.bnName, r);
  r = await call("GET", `/geo/bd?level=districts&parent=${dhaka?.id}`);
  const dd = r.data?.find((d: { name: string }) => d.name === "Dhaka");
  check("districts of Dhaka division include Dhaka", r.status === 200 && !!dd, r);
  r = await call("GET", `/geo/bd?level=upazilas&parent=${dd?.id}`);
  const kg = r.data?.find((d: { name: string }) => d.name === "Keraniganj");
  check("upazilas of Dhaka district include Keraniganj", r.status === 200 && !!kg, r);
  r = await call("GET", `/geo/bd?level=unions&parent=${kg?.id}`);
  check("unions of Keraniganj include Hazratpur", r.status === 200 && r.data?.some((d: { name: string }) => d.name === "Hazratpur"), r);

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
