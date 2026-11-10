export type Cycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface Plan {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  audience: "OWNER" | "SELLER";
  monthlyPrice: string;
  quarterlyDiscount: number;
  yearlyDiscount: number;
  propertyLimit: number;
  unitLimit: number;
  listingLimit: number;
  features: { rentTracking?: string; maintenance?: string; rentAnalytics?: string };
  prices: Record<Cycle, { months: number; total: string; savings: string }>;
}

export interface CurrentSubscription {
  id: string;
  status: "ACTIVE" | "GRACE";
  cycle: Cycle;
  amount: string;
  startsAt: string | null;
  endsAt: string | null;
  graceEndsAt: string | null;
  cancelledAt: string | null;
  plan: { code: string; nameEn: string; nameBn: string };
}

export interface PendingRequest {
  id: string;
  planId: string;
  cycle: Cycle;
  createdAt: string;
  expectedAmount: string;
  trxId: string;
  plan: { code: string; nameEn: string; nameBn: string };
}

export interface MySubscription {
  owner: {
    status: "NONE" | "ACTIVE" | "GRACE";
    planCode: string | null;
    limits: { propertyLimit: number; unitLimit: number; listingLimit: number; listingDurationDays: number };
    usage: { properties: number; units: number; listings: number };
  };
  current: CurrentSubscription | null;
  pendingRequest: PendingRequest | null;
  /** past and present subscriptions, newest first (to tell "never subscribed" from "expired") */
  history: { id: string; status: string; audience: string }[];
}

export type PaymentStatus = "INITIATED" | "PENDING_REVIEW" | "SUCCESS" | "FAILED" | "REFUNDED";

export interface Payment {
  id: string;
  amount: string;
  status: PaymentStatus;
  gateway: string;
  gatewayTxnId: string | null;
  createdAt: string;
  verifiedAt: string | null;
  invoice: { id: string; number: string } | null;
  plan: { code: string; nameEn: string; nameBn: string } | null;
  cycle: Cycle | null;
  period: { startsAt: string | null; endsAt: string | null } | null;
  rejectionReason: string | null;
}

export interface Quote {
  plan: { id: string; code: string; nameBn: string; nameEn: string; audience: string };
  cycle: Cycle;
  months: number;
  discountPercent: number;
  total: string;
  savings: string;
  upgradeCredit: string;
  payable: string;
  currency: "BDT";
  payment: { method: string; number: string | null; reference: string };
}

export interface InvoiceData {
  number: string;
  issuedAt: string;
  currency: string;
  customer: { fullName: string; username: string; ownerCode: string | null; phone: string | null; email: string | null };
  plan: { code?: string; nameEn?: string };
  cycle?: Cycle;
  periodStart?: string | null;
  periodEnd?: string | null;
  amount: string;
  refunded: string;
  payment: { gateway: string; reference: string | null; verifiedAt: string | null };
}
