import type { PropertyOverview, PropertyPage, PropertyRow, PropertyStats, Tab } from "../../admin/properties/types";

export type { PropertyPage, PropertyRow, Tab };

export interface GovStats extends PropertyStats {
  vacantUnits: number; verified: number; rejected: number; suspended: number; newThisMonth: number; flaggedLast30: number; openAlerts: number;
}

export type Verification = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface GovDetails extends Omit<PropertyOverview, "owner"> {
  owner: { id: string; fullName: string; phone: string | null; ownerCode: string | null; email: string | null; verificationStatus: Verification; joinedAt: string | null; accountStatus: string };
  verificationStatus: Verification; status: string;
  verification: { status: Verification; notes: string | null; reviewedAt: string | null; propertyStatus: string };
  documents: { id: string; kind: string; status: Verification; notes: string | null; createdAt: string }[];
  issueReports: number;
  audit: { id: string; action: string; at: string; by: { name: string; role: string } | null; notes: string | null; reason: string | null }[];
}
