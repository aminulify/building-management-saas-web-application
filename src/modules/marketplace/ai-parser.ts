/**
 * The "AI" of the Find Home assistant: a small, free, offline language understanding step (no paid API, nothing leaves
 * the server). It turns a sentence such as "3 bed flat near hospital in Keraniganj under 30k" (or the same in Bangla)
 * into search filters. Pure functions, so it is fully unit-tested.
 */
export type NearbyType = "HOSPITAL" | "PARK" | "MOSQUE" | "SCHOOL" | "MARKET";
export type Amenity = "PARKING" | "SECURITY" | "LIFT" | "GENERATOR" | "CCTV" | "GATED";

export interface ParsedQuery {
  type?: "RENT" | "SALE";
  categories?: string[];
  bedrooms?: number;
  bathrooms?: number;
  /** land: how big ("5 katha") and what kind ("residential") */
  area?: number;
  areaUnit?: "SQFT" | "KATHA" | "DECIMAL" | "BIGHA";
  landType?: "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL" | "INDUSTRIAL";
  minPrice?: number;
  maxPrice?: number;
  nearby: NearbyType[];
  amenities: Amenity[];
  furnishing?: "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED";
  sort?: "price_asc" | "price_desc" | "newest";
  /** what the sentence mentioned, in the order the UI shows them */
  tokens: string[];
}

const BN_DIGITS: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };

/** Lower-case, Bangla digits → 0-9, currency signs → words, collapse spaces. */
export function normalizeText(input: string): string {
  return input
    .replace(/[০-৯]/g, (d) => BN_DIGITS[d]!)
    .replace(/৳|tk\.?|bdt|taka|টাকা/gi, " tk ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "keraniganj" / "Keranigonj" / "keranigong" all map to the same key, so small spelling differences still match. */
export function placeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(gonj|ganj|gong|gang)/g, "gonj")
    .replace(/(.)\1+/g, "$1");
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|hajar|হাজার|lakh|lac|lakhs|লাখ|লক্ষ|crore|crores|কোটি)?`;

function toMoney(raw: string, unit?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  const u = (unit ?? "").toLowerCase();
  if (u === "k" || u === "thousand" || u === "hajar" || u === "হাজার") return Math.round(n * 1000);
  if (u === "crore" || u === "crores" || u === "কোটি") return Math.round(n * 10_000_000);
  if (u === "lakh" || u === "lac" || u === "lakhs" || u === "লাখ" || u === "লক্ষ") return Math.round(n * 100_000);
  return Math.round(n);
}

const num = (re: RegExp, s: string) => { const m = s.match(re); return m ? toMoney(m[1]!, m[2]) : undefined; };

export function parseQuery(input: string): ParsedQuery {
  const s = normalizeText(input);
  const out: ParsedQuery = { nearby: [], amenities: [], tokens: [] };

  // --- mode
  if (/\b(buy|purchase|for sale|sale)\b|কিনতে|কিনব|বিক্রয়/.test(s)) out.type = "SALE";
  else if (/\b(rent|rental|to let)\b|ভাড়া/.test(s)) out.type = "RENT";

  // --- bedrooms / bathrooms (the number may come before or after the word)
  const bed = s.match(/(\d{1,2})\s*[- ]?(?:bed(?:room)?s?|bhk|br\b|বেড(?:রুম)?|শোবার)/) ?? s.match(/(?:bed(?:room)?s?|বেড(?:রুম)?)\s*[:x]?\s*(\d{1,2})\b/);
  if (bed) out.bedrooms = Number(bed[1]);
  const bath = s.match(/(\d{1,2})\s*[- ]?(?:bath(?:room)?s?|washroom|বাথ(?:রুম)?)/);
  if (bath) out.bathrooms = Number(bath[1]);

  // --- type of home
  const cats: string[] = [];
  const land = /\b(land|plot|jomi)\b|জমি|প্লট|ভূমি/.test(s);
  if (land) {
    cats.push("LAND");
    if (/residential|আবাসিক/.test(s)) out.landType = "RESIDENTIAL";
    else if (/commercial|বাণিজ্যিক/.test(s)) out.landType = "COMMERCIAL";
    else if (/agricultur|farm|কৃষি/.test(s)) out.landType = "AGRICULTURAL";
    else if (/industrial|শিল্প/.test(s)) out.landType = "INDUSTRIAL";
    const a = s.match(/(\d+(?:\.\d+)?)\s*(katha|kata|কাঠা|decimal|শতক|bigha|বিঘা|sq\.?\s?ft|sqft|বর্গফুট)/);
    if (a) {
      out.area = Number(a[1]);
      const u = a[2]!;
      out.areaUnit = /katha|kata|কাঠা/.test(u) ? "KATHA" : /decimal|শতক/.test(u) ? "DECIMAL" : /bigha|বিঘা/.test(u) ? "BIGHA" : "SQFT";
    }
  }
  if (/duplex|ডুপ্লেক্স/.test(s)) cats.push("DUPLEX");
  if (/studio|স্টুডিও/.test(s)) cats.push("STUDIO");
  if (!land && /commercial|office|shop|showroom|অফিস|দোকান|কমার্শিয়াল/.test(s)) cats.push("COMMERCIAL");
  if (/\b(flat|apartment|apt)\b|ফ্ল্যাট|অ্যাপার্টমেন্ট/.test(s) && !cats.length) cats.push("FLAT", "APARTMENT");
  if (cats.length) out.categories = cats;

  // --- price
  const range = s.match(new RegExp(String.raw`(?:between|from)?\s*${NUM}\s*(?:to|and|-|–|থেকে)\s*${NUM}`));
  const rangeOk = range && toMoney(range[1]!, range[2] ?? range[4]) >= 1000;
  if (range && rangeOk) {
    const a = toMoney(range[1]!, range[2] ?? range[4]);
    const b = toMoney(range[3]!, range[4]);
    out.minPrice = Math.min(a, b);
    out.maxPrice = Math.max(a, b);
  } else {
    const max = num(new RegExp(String.raw`(?:under|below|less than|within|max(?:imum)?|up to|upto|not more than|budget(?: of)?|around|about)\s*(?:tk\s*)?${NUM}`), s)
      ?? num(new RegExp(String.raw`${NUM}\s*(?:tk\s*)?(?:or less|or below|max|maximum|এর নিচে|এর মধ্যে|এর কম|বাজেট)`), s);
    const min = num(new RegExp(String.raw`(?:above|over|more than|at least|min(?:imum)?|starting)\s*(?:from\s*)?(?:tk\s*)?${NUM}`), s);
    if (max !== undefined && max >= 1000) out.maxPrice = max;
    if (min !== undefined && min >= 1000) out.minPrice = min;
    if (out.maxPrice === undefined && out.minPrice === undefined) {
      // a bare amount ("flat 25000 tk", "30k") is read as the budget
      const loose = s.match(new RegExp(String.raw`(?<![\d.])${NUM}\s*(?:tk\b)?(?!\s*(?:bed|bath|sqft|sq|floor|room|bhk|বেড|বাথ))`, "g"));
      for (const piece of loose ?? []) {
        const m = piece.match(new RegExp(NUM));
        const v = m ? toMoney(m[1]!, m[2]) : NaN;
        if (v >= 3000 && v <= 5_000_000_000) { out.maxPrice = v; break; }
      }
    }
  }
  if (out.minPrice !== undefined && out.maxPrice !== undefined && out.minPrice > out.maxPrice) [out.minPrice, out.maxPrice] = [out.maxPrice, out.minPrice];

  // --- nearby facilities
  const near = (re: RegExp, t: NearbyType) => { if (re.test(s)) out.nearby.push(t); };
  near(/hospital|clinic|medical|হাসপাতাল|ক্লিনিক/, "HOSPITAL");
  near(/\bpark\b|garden|উদ্যান|পার্ক(?!িং)/, "PARK");
  near(/mosque|masjid|মসজিদ/, "MOSQUE");
  near(/school|college|university|স্কুল|কলেজ|বিশ্ববিদ্যালয়/, "SCHOOL");
  near(/market|bazar|bazaar|shopping|বাজার|মার্কেট/, "MARKET");

  // --- amenities
  const has = (re: RegExp, a: Amenity) => { if (re.test(s)) out.amenities.push(a); };
  has(/parking|garage|পার্কিং|গ্যারেজ/, "PARKING");
  has(/security|guard|সিকিউরিটি|নিরাপত্তা|গার্ড/, "SECURITY");
  has(/\blift\b|elevator|লিফট/, "LIFT");
  has(/generator|জেনারেটর/, "GENERATOR");
  has(/cctv|সিসিটিভি/, "CCTV");
  has(/gated|গেটেড/, "GATED");

  // --- furnishing
  if (/semi[- ]?furnished|সেমি/.test(s)) out.furnishing = "SEMI_FURNISHED";
  else if (/unfurnished|আনফার্নিশড/.test(s)) out.furnishing = "UNFURNISHED";
  else if (/furnished|ফার্নিশড|সাজানো/.test(s)) out.furnishing = "FURNISHED";

  // --- sort
  if (/cheap|cheapest|lowest|low price|affordable|সস্তা|কম দামে/.test(s)) out.sort = "price_asc";
  else if (/luxury|premium|expensive|highest|বিলাসবহুল/.test(s)) out.sort = "price_desc";
  else if (/newest|latest|recent|নতুন/.test(s)) out.sort = "newest";

  if (out.type) out.tokens.push(out.type === "SALE" ? "buy" : "rent");
  if (out.categories) out.tokens.push(...(out.categories.includes("FLAT") ? ["flat"] : out.categories.map((c) => c.toLowerCase())));
  return out;
}

/** Match a sentence against the place names that exist in the data (division, district, upazila, union). */
export function findPlaces(input: string, known: { division: string[]; district: string[]; upazila: string[]; unionName: string[] }) {
  const s = placeKey(normalizeText(input));
  const hit = (list: string[]) => list.filter((n) => n.length >= 3 && s.includes(placeKey(n))).sort((a, b) => b.length - a.length)[0];
  return { division: hit(known.division), district: hit(known.district), upazila: hit(known.upazila), unionName: hit(known.unionName) };
}
