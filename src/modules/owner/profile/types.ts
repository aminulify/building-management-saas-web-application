/** Shape returned by GET /me/owner-overview and GET /tenancies/agreements. */
export type DocStatus = "PENDING" | "VERIFIED" | "REJECTED";
export interface DocState { status: DocStatus; date: string; notes: string | null }

export interface OwnerOverview {
  user: {
    id: string; username: string; ownerCode: string | null; fullName: string; email: string | null; phone: string | null; occupation: string | null; gender: string | null;
    dateOfBirth: string | null; nid: string | null; memberSince: string; verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; avatarUrl: string | null; businessName: string | null;
  };
  address: { division: string; district: string; upazila: string | null; union: string | null; street: string | null; postOffice: string | null } | null;
  strength: { percent: number; missing: string[] };
  portfolio: { properties: number; units: number; tenants: number };
  properties: { id: string; name: string; locationLabel: string; coverUrl: string | null; units: number; occupied: number }[];
  documents: {
    nidFront: DocState | null;
    nidBack: DocState | null;
    agreement: { total: number; uploaded: number; status: "NONE" | "PENDING" | "UPLOADED"; date: string | null };
  };
}

export type OverviewProperty = OwnerOverview["properties"][number];

export interface AgreementRow {
  id: string;
  startDate: string;
  endDate: string | null;
  rent: string;
  hasDocument: boolean;
  docType: "pdf" | "image" | null;
  signatureRequestedAt: string | null;
  property: { id: string; name: string };
  unit: { unitNumber: string };
  tenant: { id: string; fullName: string; phone: string | null; avatarUrl: string | null } | null;
}

export type DocKind = "NID_FRONT" | "NID_BACK";
