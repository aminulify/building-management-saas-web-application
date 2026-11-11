/** Shapes returned by GET /tenant/history, GET /tenant/history/:id/records and GET /tenant/rent/:recordId/invoice. */
export type LedgerState = "PAID" | "PENDING" | "UNPAID";
export type UnpaidState = "CLEAR" | "DUE_SOON" | "OVERDUE";

export interface LedgerRow {
  recordId: string; month: string; amount: string; paid: string; owed: string; state: LedgerState; late: boolean;
  pending: { id: string; method: string; sentAt: string; amount: string } | null; paidAt: string | null;
}

export interface Stay {
  id: string; status: "ACTIVE" | "COMPLETED"; startDate: string; endDate: string | null; rent: string;
  property: { id: string; name: string; addressLine: string };
  unit: { unitNumber: string; floor: number };
  landlord: { id: string; fullName: string; ownerCode: string | null } | null;
  payTo: string | null;
  ledger: { items: LedgerRow[]; hasMore: boolean; total: number };
}

export interface HistorySummary {
  yearsRented: number; since: string | null; properties: number; propertyNames: string[];
  unpaid: { amount: string; late: string; state: UnpaidState; months: number; lateMonths: number; graceDay: number };
  firstRecordMonth: string | null;
}
export interface History { summary: HistorySummary; stays: Stay[] }
export interface RecordsPage { items: LedgerRow[]; hasMore: boolean }

export interface Invoice {
  invoiceNo: string; billingMonth: string; paidAt: string; methods: string[]; reference: string | null;
  owner: { fullName: string; ownerCode: string | null; phone: string | null } | null;
  tenant: { fullName: string; username: string; phone: string | null } | null;
  property: string; unit: string; floor: number;
  items: { rent: string; utility: string; other: string };
  total: string; paid: string; currency: string;
  payments: { amount: string; method: string; reference: string | null; paidAt: string }[];
}
