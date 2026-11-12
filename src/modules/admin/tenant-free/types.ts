import type { DocView } from "../tenants/types";

export type FreeTab = "all" | "VERIFIED" | "PENDING" | "UNVERIFIED" | "REJECTED";
export type FreeState = "ACTIVE" | "SUSPENDED";
export type Verification = "VERIFIED" | "PENDING" | "REJECTED" | "UNVERIFIED";

export interface FreeStats { total: number; newLast30: number; verified: number; verifiedRate: number; pending: number }

export interface FreeRow {
  id: string; fullName: string; username: string; tenantCode: string | null; email: string | null; phone: string | null; occupation: string | null;
  verificationStatus: Verification; createdAt: string; state: FreeState; avatarUrl: string | null; location: string; visibleToOwners: boolean;
}
export interface FreePage { items: FreeRow[]; total: number; page: number; pageSize: number }

export interface FreeDetails {
  id: string; fullName: string; username: string; tenantCode: string | null; email: string | null; phone: string | null; occupation: string | null; gender: string | null;
  dateOfBirth: string | null; nid: string | null; nidLast4: string | null; verificationStatus: Verification; createdAt: string; lastSeenAt: string | null; avatarUrl: string | null;
  state: FreeState; address: string | null; visibleToOwners: boolean; gaps: string[];
  documents: Record<"nidFront" | "nidBack" | "agreement", DocView | null>;
  log: { id: string; action: "ACTIVE" | "WARNING" | "SUSPENDED" | "ARCHIVED"; comment: string | null; adminUsername: string; createdAt: string }[];
}
