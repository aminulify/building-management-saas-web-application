import type { DocView } from "../tenants/types";

export type Mode = "rental" | "market";
export type Tier = "all" | "PRIMARY" | "MILLIONAIRE" | "BILLIONAIRE";
export type AccountState = "ACTIVE" | "WARNING" | "SUSPENDED";
export type StatusFilter = "all" | AccountState;
export type Verification = "VERIFIED" | "PENDING" | "REJECTED" | "UNVERIFIED";
export type VerificationFilter = "all" | Verification;
export interface PlanRef { code: string; nameEn: string; nameBn: string }

export interface OwnerStats { mode: Mode; range: { from: string; to: string }; totalOwners: number; total: number; average: number; fresh: number }

export interface MarketFigures { total: number; forSale: number; sold: number; soldValue: number }
export interface OwnerRow {
  id: string; fullName: string; username: string; ownerCode: string | null; email: string | null; phone: string | null; createdAt: string;
  state: AccountState; verification: Verification; avatarUrl: string | null; plan: PlanRef | null; portfolio: { properties: number; units: number }; market?: MarketFigures;
}
export interface OwnerPage { items: OwnerRow[]; total: number; page: number; pageSize: number; mode: Mode }

export interface OwnerDetails {
  id: string; fullName: string; username: string; ownerCode: string | null; email: string | null; phone: string | null; createdAt: string; lastSeenAt: string | null;
  state: AccountState; avatarUrl: string | null; verificationStatus: Verification; gender: string | null; occupation: string | null; nid: string | null; nidLast4: string | null; dateOfBirth: string | null; address: string | null;
  documents: Record<"nidFront" | "nidBack" | "agreement", DocView | null>;
  subscription: { status: string; cycle: string; startsAt: string | null; endsAt: string | null; amount: string; plan: PlanRef } | null;
  payments: { count: number; total: string };
  totals: { properties: number; units: number; occupied: number; vacant: number };
  market: { forSale: number; sold: number; soldValue: string };
  properties: { id: string; name: string; type: string; status: string; totalFloors: number; location: string; units: number; occupied: number; vacant: number }[];
  forSaleList: ListingRecord[]; soldList: ListingRecord[];
  log: { id: string; action: "ACTIVE" | "WARNING" | "SUSPENDED" | "ARCHIVED"; comment: string | null; adminUsername: string; createdAt: string }[];
}

export interface ListingRecord { id: string; title: string; category: string; price: string; status: string; isFeatured: boolean; createdAt: string; bedrooms: number | null; location: string }

export interface PropertyShort {
  id: string; name: string; type: string; status: string; totalFloors: number; createdAt: string; amenities: string[]; location: string;
  totals: { units: number; occupied: number; vacant: number };
  units: { id: string; unitNumber: string; floor: number; bedrooms: number; bathrooms: number; areaSqft: number | null; rent: string; availability: string; tenant: string | null }[];
}
export interface ListingShort {
  id: string; title: string; category: string; status: string; price: string; negotiable: boolean; description: string; isFeatured: boolean; createdAt: string; updatedAt: string;
  bedrooms: number | null; bathrooms: number | null; area: string | null; areaUnit: string | null; floor: number | null; totalFloors: number | null; photoUrl: string | null; location: string;
}
