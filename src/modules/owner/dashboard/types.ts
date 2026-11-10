/** Shapes returned by GET /dashboard/owner, /stats, /revenue and /activities. Money arrives as decimal strings. */
export interface OwnerOverview {
  portfolio: {
    properties: number; totalUnits: number; units: Record<string, number>; occupancyRate: number;
    activeTenants: number; leasesExpiringIn60Days: number;
  };
  rentThisMonth: { month: string; expected: string; collected: string; outstanding: string; overdue: string; collectionRate: number; records: number };
  overdueRecords: number;
  subscription: {
    status: string; plan: string | null;
    limits: { propertyLimit: number; unitLimit: number };
    usage: { properties: number; units: number };
  };
}

export interface OwnerStats {
  unpaidUnitsLast30Days: number;
  maintenance: { total: number; solved: number; solvedRate: number };
}

export interface RevenueMonth { month: number; expected: string; collected: string }
export interface OwnerRevenue { year: number; months: RevenueMonth[]; totals: { expected: string; collected: string }; years: number[] }

export type ActivityKind = "TENANT_ADDED" | "RENT_PAID" | "MAINTENANCE_REQUESTED" | "ALERT_SENT" | "REMINDERS_SENT";
export interface Activity { id: string; kind: ActivityKind; at: string; unit: string | null; amount: string | null; text: string | null }
export interface OwnerActivities { items: Activity[]; hasMore: boolean }

export interface District { id: string; nameEn: string; nameBn: string }
