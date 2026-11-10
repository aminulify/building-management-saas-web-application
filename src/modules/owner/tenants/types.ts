/** Shapes returned by GET /tenancies/directory. */
export type TenantStatus = "ACTIVE" | "OVERDUE" | "NOTICE_GIVEN";
export type TenantTab = "all" | "leaveSoon" | "overdue";

export interface DirectoryRow {
  id: string;
  unit: { id: string; unitNumber: string; rent: string };
  property: { id: string; name: string };
  startDate: string;
  endDate: string | null;
  members: number;
  rent: string;
  deposit: string;
  noticeGivenAt: string | null;
  createdAt: string;
  status: TenantStatus;
  overdueAmount: string | null;
  leaveSoon: boolean;
  tenant: { id: string; fullName: string; email: string | null; phone: string | null; avatarUrl: string | null } | null;
}

export interface DirectoryPage {
  items: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: { active: number; leaveSoon: number; overdue: number; joinedLast30Days: number };
}

export interface RentRecordRow {
  id: string;
  billingMonth: string;
  total: string;
  paid: string;
  status: "DUE" | "PARTIAL" | "PAID" | "OVERDUE";
  dueDate: string;
  payments: { id: string; amount: string; method: string; paidAt: string }[];
}
