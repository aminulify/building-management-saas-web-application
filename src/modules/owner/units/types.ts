/** Shapes returned by GET /units (owner-wide list) and GET /tenancies/lookup. */
export type UnitStatus = "OCCUPIED" | "VACANT" | "MAINTENANCE";

export interface UnitRow {
  id: string;
  unitNumber: string;
  floor: number;
  bedrooms: number;
  bathrooms: number;
  diningRooms: number;
  kitchens: number;
  areaSqft: number | null;
  rent: string;
  deposit: string;
  utilityCharge: string;
  furnishing: "UNFURNISHED" | "SEMI_FURNISHED" | "FURNISHED";
  availability: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
  status: UnitStatus;
  property: { id: string; name: string; totalFloors: number; locationLabel: string };
  agreementId: string | null;
  tenant: { id: string; fullName: string; phone: string | null; avatarUrl: string | null } | null;
}

export interface UnitsPage {
  items: UnitRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; occupied: number; vacant: number; maintenance: number };
}

export interface OwnerProperty { id: string; name: string; totalFloors: number; locationLabel: string }

export interface TenantMatch { id: string; fullName: string; phone: string | null; email?: string | null; avatarUrl: string | null; hasActiveTenancy: boolean }
export type LookupResult = { found: false } | { found: true; tenant: TenantMatch };
