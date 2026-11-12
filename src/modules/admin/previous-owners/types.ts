export type ExitState = "ARCHIVED" | "BANNED" | "INACTIVE" | "DELETED";
export type StatusFilter = "all" | ExitState;
export type Reason = "SUBSCRIPTION_CANCELLED" | "POLICY_VIOLATION_FRAUD" | "BUSINESS_CLOSED" | "SOLD_ALL_PROPERTIES" | "ACCOUNT_DELETED_BY_USER" | "NON_PAYMENT" | "DORMANT" | "OWNER_REQUEST" | "OTHER";
export type ReasonFilter = "all" | Reason;
export type NewState = "ACTIVE" | ExitState;

export const STATES: ExitState[] = ["ARCHIVED", "BANNED", "INACTIVE", "DELETED"];
export const REASONS: Reason[] = ["SUBSCRIPTION_CANCELLED", "POLICY_VIOLATION_FRAUD", "BUSINESS_CLOSED", "SOLD_ALL_PROPERTIES", "ACCOUNT_DELETED_BY_USER", "NON_PAYMENT", "DORMANT", "OWNER_REQUEST", "OTHER"];

export interface ArchiveStats { archived: number; banned: number; inactive: number; deleted: number; total: number; reactivated: number }
export interface ArchiveRow {
  id: string; fullName: string; username: string; ownerCode: string | null; email: string | null; phone: string | null; avatarUrl: string | null;
  state: ExitState; reasonCode: Reason; archiveReason: string | null; leftAt: string; properties: number;
}
export interface ArchivePage { items: ArchiveRow[]; total: number; page: number; pageSize: number }

export interface ArchiveProperty { id: string; name: string; type: string; status: string; archived: boolean; reasonCode: string | null; units: number; location: string }
export interface ArchiveLog { id: string; action: "ACTIVE" | "WARNING" | "SUSPENDED" | "ARCHIVED" | "BANNED" | "INACTIVE" | "DELETED"; comment: string | null; adminUsername: string; createdAt: string }
export interface ArchiveDetails {
  id: string; fullName: string; username: string; ownerCode: string | null; email: string | null; phone: string | null; avatarUrl: string | null; gender: string | null; occupation: string | null;
  dateOfBirth: string | null; nid: string | null; verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"; createdAt: string; lastSeenAt: string | null; address: string;
  state: ExitState; reasonCode: Reason; reasonNote: string | null; leftAt: string; listings: number; paid: { total: string; count: number };
  lastPlan: { status: string; endsAt: string | null; nameEn: string; nameBn: string } | null; properties: ArchiveProperty[]; log: ArchiveLog[];
}
