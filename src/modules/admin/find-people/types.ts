export type FoundRole = "OWNER" | "TENANT" | "GENERAL_USER";
export type Verification = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface FoundPerson {
  id: string; role: FoundRole; fullName: string; username: string; ownerCode: string | null; tenantCode: string | null; email: string | null; phone: string | null;
  verificationStatus: Verification; nidVerified: boolean; nid: string | null; status: string; archived: boolean; online: boolean; avatarUrl: string | null;
}
export interface FindResult { items: FoundPerson[]; matchedBy: string[] }

export interface LogRow { id: string; action: "ACTIVE" | "WARNING" | "SUSPENDED" | "ARCHIVED" | "BANNED" | "INACTIVE" | "DELETED"; comment: string | null; adminUsername: string; createdAt: string }
export interface ListingRow { id: string; title: string; price: string; status: string; category: string; location: string; createdAt: string }
export interface OwnerPart {
  plan: { code: string; nameEn: string; nameBn: string; status: string; cycle: string; endsAt: string | null } | null;
  units: { total: number; occupied: number; vacant: number; maintenance: number };
  properties: { id: string; name: string; type: string; status: string; units: number; location: string }[];
  tenants: { id: string; name: string; code: string | null; phone: string | null; property: string; propertyId: string; unitId: string; unit: string; rent: string; since: string }[];
  forSale: ListingRow[]; sold: ListingRow[];
  unitList: { id: string; unitNumber: string; floor: number; bedrooms: number; rent: string; availability: string; property: string; propertyId: string; tenant: string | null }[];
}
export interface TenantPart {
  previousTenancies: number;
  residence: { propertyId: string; unitId: string; property: string; unit: string; floor: number; location: string; rent: string; deposit: string; startDate: string; endDate: string | null; members: number; noticeGiven: boolean } | null;
  landlord: { id: string; fullName: string; ownerCode: string | null; email: string | null; phone: string | null } | null;
  ledger: { id: string; month: string; total: string; paid: string; status: "DUE" | "PARTIAL" | "PAID" | "OVERDUE"; dueDate: string }[];
}
export interface FreePart {
  favoriteCount: number; searchCount: number;
  favorites: { id: string; listingId: string; savedAt: string; title: string; type: string; category: string; price: string; status: string; location: string }[];
  searches: { id: string; at: string; summary: string }[];
  upgrade: { status: string; toRole: string; cycle: string; amount: string; rejectionReason: string | null; at: string; planEn: string; planBn: string } | null;
}
export interface FullProfile extends Omit<FoundPerson, "archived" | "nidVerified" | "verificationStatus"> {
  verificationStatus: Verification; gender: string | null; occupation: string | null; dateOfBirth: string | null; createdAt: string; lastSeenAt: string | null;
  archived: boolean; state: "ACTIVE" | "WARNING" | "SUSPENDED"; accountStatus: string; address: string; log: LogRow[]; listings: number;
  owner: OwnerPart | null; tenant: TenantPart | null; free: FreePart | null;
}

export interface PersonRef { id: string; fullName: string; ownerCode: string | null; email: string | null; phone: string | null }
export interface PropertyFull {
  id: string; name: string; type: string; description: string | null; status: string; verificationStatus: string; totalFloors: number; totalSqft: number | null; createdAt: string;
  archived: boolean; archiveReason: string | null; location: string; amenities: string[]; owner: PersonRef; photos: string[];
  totals: { units: number; occupied: number; repair: number; vacant: number };
  units: { id: string; unitNumber: string; floor: number; bedrooms: number; bathrooms: number; areaSqft: number | null; rent: string; availability: string; tenant: { id: string; name: string; code: string | null } | null }[];
}
export interface ListingFull {
  id: string; title: string; type: string; category: string; status: string; description: string; negotiable: boolean; isFeatured: boolean; bedrooms: number | null; bathrooms: number | null;
  floor: number | null; totalFloors: number | null; areaUnit: string | null; createdAt: string; updatedAt: string; price: string; area: string | null; location: string;
  seller: PersonRef; property: { id: string; name: string } | null; photos: string[];
}
export interface UnitFull {
  id: string; unitNumber: string; floor: number; bedrooms: number; bathrooms: number; diningRooms: number; kitchens: number; areaSqft: number | null; furnishing: string;
  rent: string; deposit: string; utilityCharge: string; availability: string; description: string | null;
  property: { id: string; name: string; location: string }; owner: PersonRef;
  lease: { rent: string; deposit: string; startDate: string; endDate: string | null; members: number; noticeGiven: boolean } | null;
  tenant: { id: string; fullName: string; tenantCode: string | null; email: string | null; phone: string | null } | null;
  ledger: { id: string; month: string; total: string; paid: string; status: "DUE" | "PARTIAL" | "PAID" | "OVERDUE" }[];
  previousTenancies: number; tickets: { open: number; total: number };
}
