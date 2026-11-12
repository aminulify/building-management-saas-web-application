export type ReqStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type ReqPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface MaintStats {
  range: { from: string; to: string };
  total: number; open: number; critical: number; avgResolutionDays: number | null; resolvedCount: number;
  categories: { category: string; count: number; percent: number }[];
}

export interface ReqRow {
  id: string; ticketNo: number; title: string; category: string; priority: ReqPriority; status: ReqStatus; technicianName: string | null; createdAt: string; resolvedAt: string | null;
  unit: { unitNumber: string; property: { name: string } };
  owner: { id: string; fullName: string; ownerCode: string | null; phone: string | null };
  tenant: { id: string; fullName: string; tenantCode: string | null };
}
export interface ReqPage { items: ReqRow[]; nextCursor: string | null; total: number }

export interface Person { id: string; fullName: string; phone: string | null; email: string | null; avatarUrl: string | null }
export interface ReqDetails {
  id: string; ticketNo: number; title: string; description: string; category: string; priority: ReqPriority; status: ReqStatus;
  technicianName: string | null; preferredAt: string | null; createdAt: string; resolvedAt: string | null;
  unit: { unitNumber: string; floor: number; bedrooms: number; bathrooms: number; areaSqft: number | null; property: { name: string } };
  property: {
    name: string; type: string; totalFloors: number; location: string; status: string; flats: number; occupied: number; vacant: number;
    issues: { total: number; open: number; resolved: number; other: number };
    recent: { id: string; ticketNo: number; title: string; status: ReqStatus; priority: ReqPriority; category: string; createdAt: string; unitNumber: string; floor: number }[];
  };
  images: { id: string; url: string | null }[];
  comments: { id: string; body: string; createdAt: string; author: string }[];
  tenant: Person & { tenantCode: string | null; memberSince: string | null; movedIn: string; rent: string };
  owner: Person & { ownerCode: string | null; memberSince: string | null; properties: number; tenants: number };
}

export interface ReqFilters { status: "all" | ReqStatus; priority: "all" | ReqPriority; category: string | null; q: string }
export const ticket = (n: number) => `REQ-${n}`;
