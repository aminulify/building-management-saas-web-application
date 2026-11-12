export interface ReportSummary {
  range: { from: string; to: string };
  paidSubscribers: number;
  subscription: { amount: string; payments: number };
  boost: { amount: string; payments: number };
  totalPaid: string;
}
export interface ReportRevenue {
  year: number; years: number[];
  months: { month: number; subscription: number; boost: number }[];
  totals: { subscription: number; boost: number };
}
export interface ReportPlans { items: { code: string; nameEn: string; nameBn: string; subscribers: number }[]; boost: number; total: number }
export interface ReportBreakdown {
  range: { from: string; to: string }; generatedAt: string; totalSold: number; total: string;
  plans: { code: string; nameEn: string; nameBn: string; sold: number; amount: string }[];
  boost: { sold: number; amount: string };
}

export type TxnFilter = "all" | "active" | "failed";
export type TxnStatus = "INITIATED" | "PENDING_REVIEW" | "SUCCESS" | "FAILED" | "REFUNDED";
export interface TxnRow {
  id: string; gatewayTxnId: string; purpose: "SUBSCRIPTION" | "PROMOTION"; amount: string; status: TxnStatus; createdAt: string; verifiedAt: string | null;
  owner: { fullName: string; username: string; role: "OWNER" | "TENANT" | "GENERAL_USER" | string };
  plan: { code: string; nameEn: string; nameBn: string } | null;
}
export interface TxnPage { items: TxnRow[]; nextCursor: string | null; total: number }
