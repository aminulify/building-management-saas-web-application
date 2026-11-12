/** Shapes returned by GET /tenant/notifications and GET /tenant/notifications/summary. */
export type Tab = "all" | "payment" | "services" | "issues";
export type ItemTab = Exclude<Tab, "all"> | "other";

export type Live =
  | { kind: "rent"; recordId: string; state: "PAID" | "PENDING" | "UNPAID"; owed: string; total: string; month: string; late: boolean }
  | { kind: "request"; id: string; status: "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED" }
  | { kind: "alert"; id: string; type: string; status: "NEED_ACTION" | "PROCESSING" | "SOLVED" | "FALSE_ALARM"; accepted: boolean };

export interface FeedItem {
  id: string; type: string; titleKey: string; params: Record<string, unknown>; link?: string | null; priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readAt: string | null; createdAt: string; tab: ItemTab; live: Live | null;
}
export interface FeedPage { items: FeedItem[]; nextCursor: string | null; unread: number }

export interface Summary {
  hasLease: boolean;
  nextPayment: { recordId: string | null; month: string; dueDate: string; amount: string; state: "DUE" | "PARTIAL" | "OVERDUE" | "UPCOMING"; pending: boolean } | null;
  pendingTasks: number;
  quickIssues: { total: number; ruleWarnings: number; alerts: number };
  owner: { fullName: string } | null;
  payTo: string | null;
}

/** How a card looks: its colour family, label and what it offers. */
export type Tone = "red" | "green" | "yellow" | "pink" | "purple" | "slate" | "orange";
