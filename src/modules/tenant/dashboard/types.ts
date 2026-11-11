/** Shapes returned by GET /dashboard/tenant and GET /dashboard/tenant/activity. */
export type PayState = "DUE" | "PARTIAL" | "OVERDUE" | "UPCOMING";

export interface TenantDashboard {
  tenancy: null | {
    id: string; rent: string; deposit: string; startDate: string; endDate: string | null;
    unit: { unitNumber: string; floor: number; areaSqft: number | null; bedrooms: number; bathrooms: number; utilityCharge: string };
    property: { id: string; name: string; addressLine: string };
    hasAgreementDocument: boolean; agreementType: "pdf" | "image" | null;
    owner: { id: string; fullName: string; ownerCode: string | null; phone: string | null; avatarUrl: string | null } | null;
  };
  nextPayment?: {
    recordId: string | null; month: string; amount: string; dueDate: string; state: PayState; lastPaidAt: string | null; lastPaidAmount: string | null;
    pending: { id: string; amount: string; method: string; sentAt: string } | null; payTo: string | null;
  };
  rent?: { month: string; total: string; paid: string; balance: string; status: string; dueDate: string; daysToDue: number } | null;
  overdue?: { records: number; amount: string };
  activeSos?: number;
}

export type ActivityKind = "payment" | "repair" | "incident" | "sos";
export interface ActivityItem { kind: ActivityKind; id: string; title: string | null; status: string; amount: string | null; month: string | null; at: string }
export interface ActivityPage { items: ActivityItem[]; hasMore: boolean }

export type RepairStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type SosStage = "RECEIVED_BY_PLATFORM" | "SEEN_BY_GOV" | "FORWARDED" | "SOLVED";
export interface MyAlert { id: string; type: string; status: string; stage: SosStage; forwardRef?: string | null; forwardTo?: string | null }
