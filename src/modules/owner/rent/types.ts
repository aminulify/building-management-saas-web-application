/** Shapes returned by GET /rent/ledger, /rent/report, /rent/payments/:id/receipt and POST /rent/remind. Money = decimal string. */
export type LedgerStatus = "PAID" | "UNPAID" | "OVERDUE";
export type StatusFilter = "all" | "paid" | "unpaid";

export interface LedgerItem {
  recordId: string;
  agreementId: string;
  tenantId: string;
  tenant: string | null;
  tenantPhone: string | null;
  unit: string;
  property: string;
  propertyId: string;
  billingMonth: string;
  carriedOver: boolean;
  dueDate: string;
  total: string;
  paid: string;
  outstanding: string;
  status: LedgerStatus;
  partial: boolean;
  paidAt: string | null;
  receiptPaymentId: string | null;
  pastDue: boolean;
}

export interface LedgerStats {
  expected: string;
  collected: string;
  pending: string;
  overdueCount: number;
  overdueAmount: string;
  dueAmount: string;
  unpaidCount: number;
  collectionRate: number;
  records: number;
  remindable: { count: number; tenants: number; amount: string };
}

export interface LedgerPage { month: string; propertyId: string | null; stats: LedgerStats; items: LedgerItem[]; total: number; page: number; pageSize: number }

export interface RentReport {
  generatedAt: string;
  owner: { fullName: string; ownerCode: string | null };
  month: string;
  property: string | null;
  status: StatusFilter;
  search: string | null;
  stats: LedgerStats;
  rows: LedgerItem[];
}

export interface RentReceipt {
  receiptNo: string;
  issuedAt: string;
  billingMonth: string;
  owner: { fullName: string; ownerCode: string | null } | null;
  tenant: { fullName: string; username: string } | null;
  property: string;
  unit: string;
  floor: number;
  amount: string;
  method: string;
  reference: string | null;
  recordTotal: string;
  recordPaid: string;
  balance: string;
  currency: string;
}

export interface RemindResult { sent: number; skippedRecent: number; eligible: number; smsQueued: number }
