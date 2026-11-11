/** Shape of GET /me/tenant-overview. */
export type DocStatus = "PENDING" | "VERIFIED" | "REJECTED";
export interface DocState { status: DocStatus; date: string; notes: string | null }
export interface AgreementState extends DocState { source: "OWN" | "LANDLORD" }

export interface TenantOverview {
  user: {
    id: string; username: string; tenantCode: string; role: "TENANT" | "GENERAL_USER"; fullName: string; email: string | null; phone: string | null;
    occupation: string | null; dateOfBirth: string | null; nid: string | null; members: number; memberSince: string;
    verificationStatus: string; avatarUrl: string | null;
  };
  /** the home the person lives in now: only for a verified tenant */
  tenancy: { property: { name: string; addressLine: string }; unit: { unitNumber: string; floor: number }; landlord: { fullName: string; ownerCode: string | null } | null; startDate: string; endDate: string | null } | null;
  address: { division: string; district: string; upazila: string | null; union: string | null; street: string | null; postOffice: string | null } | null;
  documents: { nidFront: DocState | null; nidBack: DocState | null; agreement: AgreementState | null };
}
