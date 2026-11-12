export type RentState = "CLEARED" | "DUE_1" | "DUE_2" | "DUE_3_PLUS";
export type RentFilter = "all" | RentState;
export type Reason = "LEASE_EXPIRED" | "POLICY_VIOLATION" | "PURCHASED_HOME" | "JOB_TRANSFER" | "BUSINESS_CLOSED" | "EVICTED" | "UPGRADED_UNIT" | "OTHER";
export type ReasonFilter = "all" | Reason;

export const RENT_STATES: RentState[] = ["CLEARED", "DUE_1", "DUE_2", "DUE_3_PLUS"];
export const REASONS: Reason[] = ["LEASE_EXPIRED", "POLICY_VIOLATION", "PURCHASED_HOME", "JOB_TRANSFER", "BUSINESS_CLOSED", "EVICTED", "UPGRADED_UNIT", "OTHER"];

export interface ArchiveStats { total: number; unpaid: number; cleared: number; unpaidAmount: number; avgYears: number; movedOutRecently: number }
export interface TenantCard { id: string; fullName: string; tenantCode: string | null; email: string | null; phone: string | null; avatarUrl: string | null }
export interface ArchiveRow {
  id: string; status: "ENDED" | "TERMINATED"; startDate: string; moveOutAt: string; reasonCode: Reason; note: string | null; rentStatus: RentState; unpaid: string;
  tenant: TenantCard; residence: { property: string; unit: string; landlord: string; ownerCode: string | null };
}
export interface ArchivePage { items: ArchiveRow[]; total: number; page: number; pageSize: number }

export interface LedgerRow { id: string; month: string; total: string; paid: string; status: "DUE" | "PARTIAL" | "PAID" | "OVERDUE" }
export interface ArchiveDetails {
  id: string; status: "ENDED" | "TERMINATED"; startDate: string; moveOutAt: string; members: number; rent: string; deposit: string; settlement: string | null;
  reasonCode: Reason; behavior: string | null; note: string | null; rentStatus: RentState; derivedStatus: RentState; overridden: boolean; unpaid: string; openMonths: number;
  tenant: (TenantCard & { username: string; occupation: string | null; nid: string | null; verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; accountStatus: string; joined: string }) | null;
  residence: { property: string; unit: string; floor: number; location: string };
  landlord: { id: string; fullName: string; ownerCode: string | null; email: string | null; phone: string | null } | null;
  ledger: LedgerRow[];
  history: { id: string; action: string; at: string; by: string | null; rentStatus: string | null; reason: string | null }[];
}
