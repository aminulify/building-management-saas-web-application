export type Tab = "all" | "payment" | "maintenance";

export interface Notification {
  id: string;
  type: string;
  titleKey: string;
  params: Record<string, unknown>;
  link: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readAt: string | null;
  createdAt: string;
  category: "payment" | "maintenance" | "other";
}

export interface NotificationsPage {
  items: Notification[];
  nextCursor: string | null;
  unread: number;
  unreadByCategory: { payment: number; maintenance: number };
}

/** What a card looks like: decided from the notification type (and, for emergency updates, its status). */
export type Kind = "received" | "overdue" | "emergency" | "solve" | "quick" | "maintenance" | "tenancy" | "generic";

export interface Receipt {
  receiptNo: string;
  issuedAt: string;
  billingMonth: string;
  owner: { fullName: string; ownerCode: string | null } | null;
  tenant: { id: string; fullName: string; username: string; phone: string | null; avatarUrl: string | null } | null;
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
  status: string;
}

export interface IssueDetail {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  category: string;
  createdAt: string;
  images: { id: string; url: string | null }[];
  unit: { unitNumber: string; floor: number | null; property: { name: string } };
  tenant: { id: string; fullName: string; username: string; phone: string | null };
  comments: { id: string; body: string; createdAt: string }[];
}

export interface AlertDetail {
  id: string;
  type: string;
  description: string | null;
  status: "NEED_ACTION" | "PROCESSING" | "SOLVED" | "FALSE_ALARM";
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  acceptedAt: string | null;
  stage: string;
  isReporter: boolean;
  canAccept: boolean;
  property: string | null;
  unit: string | null;
  floor: number | null;
  reporter: { name: string; phone: string | null };
  log: { action: string; toStatus: string | null; note: string | null; at: string; byReporter: boolean }[];
}
