import type { ModerationState } from "./state";

export type Mode = "rent" | "sale";
export type StatusFilter = "all" | "active" | "pending" | "reported" | "rejected";
export type OccupancyFilter = "all" | "occupied" | "vacant";
export type SaleFilter = "all" | "for_sale" | "sold";

export type CategoryFilter = "all" | "FLAT" | "APARTMENT" | "BUILDING" | "LAND" | "COMMERCIAL" | "DUPLEX" | "STUDIO";

export interface HomeFilters { mode: Mode; status: StatusFilter; occupancy: OccupancyFilter; sale: SaleFilter; /** marketplace page only */ q?: string; category?: CategoryFilter; featured?: "all" | "yes" }

export interface HomeRow {
  id: string; title: string; category: string; createdAt: string;
  owner: { id: string; fullName: string; phone: string | null; email: string | null; ownerCode: string | null };
  location: string; price: string; area: string | null; areaUnit: string | null;
  status: string; state: ModerationState; openReports: number; occupied: boolean; sold: boolean; thumbnailUrl: string | null;
  isFeatured: boolean; bedrooms: number | null; bathrooms: number | null; negotiable: boolean;
}
export interface HomePage { items: HomeRow[]; nextCursor: string | null; total: number }
export interface HomeStats { mode: Mode; total: number; active: number; pending: number; reported: number; rejected: number; featured: number; sold: number }

export interface HomeOverview {
  id: string; title: string; type: "RENT" | "SALE"; category: string; description: string; status: string; state: ModerationState; createdAt: string;
  isFeatured: boolean; price: string; negotiable: boolean; furnishing: string | null; availableFrom: string | null; rejectionReason: string | null; location: string;
  specs: { area: string | null; areaUnit: string | null; bedrooms: number | null; bathrooms: number | null; balconies: number | null; floor: number | null; totalFloors: number | null };
  photos: { id: string; url: string }[];
  owner: { id: string; fullName: string; phone: string | null; email: string | null; ownerCode: string | null; avatarUrl: string | null };
  tenancy: null | { tenant: { id: string; fullName: string; tenantCode: string | null; avatarUrl: string | null }; checkIn: string; rentStatus: string | null };
  occupied: boolean; unitNumber: string | null;
  nearby: Record<"SCHOOL" | "COLLEGE" | "HOSPITAL" | "PARK" | "SECURITY", boolean>;
  reports: { id: string; category: string; description: string | null; createdAt: string }[];
}
