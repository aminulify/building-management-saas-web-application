import type { AdminPropertyState } from "./status";

export type Tab = "all" | "active" | "pending";

export interface PropertyRow {
  id: string;
  name: string;
  type: string;
  status: string;
  verificationStatus: string;
  state: AdminPropertyState;
  location: string;
  totalUnits: number;
  occupiedUnits: number;
  owner: { id: string; fullName: string; phone: string | null; ownerCode: string | null };
}

export interface PropertyPage { items: PropertyRow[]; nextCursor: string | null; total: number }

export interface PropertyStats { totalProperties: number; totalUnits: number; occupiedUnits: number; occupancyRate: number; pendingApproval: number }

export interface UnitRow { id: string; unitNumber: string; floor: number; bedrooms: number; bathrooms: number; areaSqft: number | null; rent: string; availability: string }

export interface PropertyOverview {
  id: string; name: string; type: string; description: string | null; state: AdminPropertyState; location: string;
  totalFloors: number; sqft: number | null; createdAt: string;
  owner: { id: string; fullName: string; phone: string | null; ownerCode: string | null };
  photos: { id: string; url: string }[];
  amenities: string[];
  occupancy: { totalUnits: number; occupiedUnits: number; vacantUnits: number; rate: number };
  units: UnitRow[];
}

export interface OwnerChoice { id: string; fullName: string; phone: string | null; ownerCode: string | null }
