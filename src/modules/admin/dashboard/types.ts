export interface AdminKpis {
  range: { from: string; to: string };
  revenue: { currency: string; amount: string; payments: number };
  totalOwners: number;
  propertiesManaged: number;
  activeTenants: number;
  paidOwners: number;
  unpaidOwners: number;
}

export type Segment = "all" | "owners" | "tenants" | "free";
export type PlanStatus = "ACTIVE" | "PENDING" | "NONE" | "SUSPENDED";

export interface PlanRow {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  role: "OWNER" | "TENANT" | "GENERAL_USER";
  propertyType: string | null;
  plan: { code: string; nameEn: string; nameBn: string } | null;
  status: PlanStatus;
}

export interface PlanPage { items: PlanRow[]; nextCursor: string | null; total: number }
