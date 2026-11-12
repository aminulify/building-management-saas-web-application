export type ArchiveStatus = "ARCHIVED" | "SUSPENDED" | "INACTIVE" | "DELETED";
export type StatusFilter = "all" | ArchiveStatus;
export type Reason = "OWNER_REQUEST" | "POLICY_VIOLATION" | "NON_PAYMENT" | "BUILDING_DEMOLISHED" | "SOLD_PROPERTY" | "RENOVATION" | "NOT_INTERESTED" | "DUPLICATE_ENTRY" | "MOVED_PLATFORM" | "OTHER";
export type ReasonFilter = "all" | Reason;
export type NewStatus = "ACTIVE" | ArchiveStatus;

export const STATUSES: ArchiveStatus[] = ["ARCHIVED", "SUSPENDED", "INACTIVE", "DELETED"];
export const REASONS: Reason[] = ["OWNER_REQUEST", "POLICY_VIOLATION", "NON_PAYMENT", "BUILDING_DEMOLISHED", "SOLD_PROPERTY", "RENOVATION", "NOT_INTERESTED", "DUPLICATE_ENTRY", "MOVED_PLATFORM", "OTHER"];

export interface ArchiveStats { archived: number; suspended: number; inactive: number; deleted: number; total: number; reactivated: number }
export interface OwnerContact { id: string; fullName: string; email: string | null; phone: string | null; ownerCode: string | null }
export interface ArchiveRow {
  id: string; name: string; status: ArchiveStatus; reasonCode: Reason; archiveReason: string | null; deactivatedAt: string; location: string; units: number; owner: OwnerContact;
}
export interface ArchivePage { items: ArchiveRow[]; total: number; page: number; pageSize: number }

export interface ArchiveUnit { id: string; unitNumber: string; floor: number | null; bedrooms: number | null; bathrooms: number | null; areaSqft: number | null; rent: string; availability: string }
export interface ArchiveHistory { id: string; action: string; at: string; by: { name: string; role: string } | null; status: string | null; reason: string | null }
export interface ArchiveDetails {
  id: string; name: string; type: string; description: string | null; status: ArchiveStatus; totalFloors: number; createdAt: string; location: string;
  reasonCode: Reason; reasonNote: string | null; deactivatedAt: string; totalUnits: number;
  owner: OwnerContact & { ready: boolean }; units: ArchiveUnit[]; history: ArchiveHistory[];
}
