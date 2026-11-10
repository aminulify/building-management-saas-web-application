export type Mode = "RENT" | "SALE";
export type CategoryChoice = "" | "APARTMENT" | "DUPLEX" | "STUDIO" | "COMMERCIAL" | "LAND" | "BUILDING";
export type LandType = "" | "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL" | "INDUSTRIAL";
export type AreaUnit = "SQFT" | "KATHA" | "DECIMAL" | "BIGHA";
export type NearbyKey = "HOSPITAL" | "PARK" | "MOSQUE" | "SCHOOL" | "MARKET";
export type AmenityKey = "PARKING" | "SECURITY" | "LIFT" | "GENERATOR" | "CCTV" | "GATED" | "MOSQUE" | "SCHOOL" | "UNIVERSITY" | "HIGHWAY" | "PARK";
export type Furnishing = "" | "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED";
export type SortKey = "newest" | "price_asc" | "price_desc" | "area_desc" | "popularity";

export interface GeoItem { id: string; name: string; bnName: string }

/** Everything the filter card (and the AI assistant) can set. */
export interface Filters {
  mode: Mode;
  /** search box: title, address, place or owner ID */
  q: string;
  /** a named area such as "Uttara Sector 4" (id from /geo/zones) */
  zoneId: string;
  division: GeoItem | null;
  district: GeoItem | null;
  upazila: GeoItem | null;
  union: GeoItem | null;
  minPrice: string;
  maxPrice: string;
  category: CategoryChoice;
  landType: LandType;
  beds: number[];
  nearby: NearbyKey[];
  amenities: AmenityKey[];
  furnishing: Furnishing;
  sort: SortKey;
  saved: boolean;
}

export interface HomeCardData {
  id: string;
  type: Mode;
  category: string;
  title: string;
  price: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area: string | null;
  areaUnit: AreaUnit | null;
  locationLabel: string;
  coverUrl: string | null;
  photos: number;
  isFavorite: boolean;
  isOwn: boolean;
  createdAt: string;
  matchPercent?: number;
  condition?: string | null;
  /** up to 5 signed photo URLs for the card carousel */
  gallery?: string[];
  seller?: { fullName: string; ownerCode: string | null; verified: boolean; avatarUrl: string | null };
}

export interface HomesPage { items: HomeCardData[]; nextCursor: string | null; total: number }

export interface HomeDetails extends HomeCardData {
  description: string;
  floor: number | null;
  totalFloors: number | null;
  balconies: number | null;
  condition: string | null;
  landDetails: { landType?: Exclude<LandType, "">; roadWidthFt?: number; plotNo?: string; mouza?: string } | null;
  photoList: { id: string; url: string }[];
  status: string;
  furnishing: Exclude<Furnishing, ""> | null;
  amenities: string[];
  negotiable: boolean;
  fullAddress: string | null;
  availableFrom: string | null;
  lat: number | null;
  lng: number | null;
  photoUrls: string[];
  distances: { facilityType: string; distanceM: number }[];
  zoneId: string | null;
  seller: { id: string; fullName: string; username: string; verified: boolean; nidStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; avatarUrl: string | null; ownerCode: string | null };
}

export type VisitStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED";
export interface VisitRow {
  id: string;
  status: VisitStatus;
  scheduledFor: string;
  note: string | null;
  responseNote: string | null;
  with: string | null;
  listing: { id: string; title: string; locationLabel?: string; fullAddress: string | null; upazila: string | null; district: string | null; coverUrl: string | null };
}

export interface AiResult {
  id: string; title: string; price: string; category: string; bedrooms: number | null; bathrooms: number | null; area: number | null;
  locationLabel: string; coverUrl: string | null; matchPercent: number; matched: string[]; missing: string[];
}
export interface AiResponse {
  query: string;
  understood: number;
  filters: {
    type: Mode; division?: string; district?: string; upazila?: string; unionName?: string; minPrice?: number; maxPrice?: number;
    bedroomList?: number[]; categories?: string[]; landType?: Exclude<LandType, "">; nearby: NearbyKey[]; amenities: AmenityKey[]; furnishing?: Exclude<Furnishing, "">; sort?: string;
  };
  profile: { saved: number; medianPrice: number | null; bedrooms: number | null; area: string | null } | null;
  results: AiResult[];
  totalCandidates: number;
}
