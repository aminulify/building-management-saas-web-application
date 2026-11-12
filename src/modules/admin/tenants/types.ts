export type TenantTab = "all" | "active" | "notice";
export type TenantState = "ACTIVE" | "NOTICE_GIVEN";
export type Verification = "VERIFIED" | "PENDING" | "REJECTED" | "UNVERIFIED";
export type VerificationFilter = "all" | Verification;
export type DocKind = "NID_FRONT" | "NID_BACK" | "AGREEMENT";

export interface TenantStats { totalTenants: number; newLast30: number; activeLeases: number; activeRate: number; expiringSoon: number }

export interface TenantRow {
  id: string; state: TenantState; endDate: string | null; rent: string; joined: string; endingSoon: boolean;
  tenant: { id: string; fullName: string; tenantCode: string | null; email: string | null; phone: string | null; avatarUrl: string | null; verification: Verification };
  residence: { property: string; unit: string; floor: number };
  owner: { id: string; fullName: string; ownerCode: string | null; phone: string | null };
}
export interface TenantPage { items: TenantRow[]; total: number; page: number; pageSize: number }

export interface Person { id: string; fullName: string; email: string | null; phone: string | null; avatarUrl: string | null }
export interface TenantDetails {
  id: string; state: TenantState; startDate: string; endDate: string | null; noticeGivenAt: string | null; members: number; rent: string; deposit: string; joined: string;
  tenant: Person & { username: string; tenantCode: string | null; occupation: string | null; verificationStatus: Verification; nid: string | null; nidLast4: string | null; dateOfBirth: string | null; gender: string | null; address: string | null; memberSince: string | null; lastSeenAt: string | null };
  owner: Person & { ownerCode: string | null };
  residence: { unitId: string; unit: string; floor: number; bedrooms: number; bathrooms: number; areaSqft: number | null; property: string; propertyType: string; location: string };
  ledger: { records: number; open: number; overdue: number; due: string };
  documents: Record<"nidFront" | "nidBack" | "agreement", DocView | null>;
  unitChoices: { id: string; unit: string; floor: number; property: string; rent: string }[];
}

export interface DocView { id: string | null; source: "TENANT" | "LANDLORD"; status: Verification; notes: string | null; uploadedAt: string; url: string | null; isPdf: boolean; reviewable: boolean; locked: boolean }
