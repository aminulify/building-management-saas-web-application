/** Shapes returned by GET /tenancies/past and GET /tenancies/:id/history. */
export type Behavior = "EXCELLENT" | "GOOD" | "AVERAGE" | "UGLY" | "BAD" | "VERY_BAD";
export type LeaveReason = "JOB_TRANSFER" | "PURCHASED_HOME" | "UPGRADED_UNIT" | "LEASE_EXPIRED" | "POLICY_VIOLATION" | "BUSINESS_CLOSED" | "EVICTED" | "OTHER";
export type LedgerStatus = "PAID_ON_TIME" | "PAID_LATE" | "DEFAULTED";

export interface PastRow {
  id: string;
  startDate: string;
  endDate: string | null;
  terminated: boolean;
  leaveReason: LeaveReason | null;
  behavior: Behavior | null;
  ownerNotes: string | null;
  property: { id: string; name: string };
  unit: { id: string; unitNumber: string };
  tenant: { id: string; fullName: string; phone: string | null; avatarUrl: string | null } | null;
}

export interface PastPage { items: PastRow[]; total: number; page: number; pageSize: number; all: number }

export interface LedgerRow { id: string; billingMonth: string; dueDate: string; total: number; paid: number; due: number; paidAt: string | null; status: LedgerStatus }

export interface PastDetail {
  id: string;
  status: "ENDED" | "TERMINATED";
  terminated: boolean;
  startDate: string;
  endDate: string | null;
  members: number;
  rent: number;
  deposit: number;
  settlementAmount: number | null;
  leaveReason: LeaveReason | null;
  behavior: Behavior | null;
  ownerNotes: string | null;
  property: { id: string; name: string };
  unit: { id: string; unitNumber: string };
  tenant: { id: string; fullName: string; phone: string | null; email: string | null; nid: string | null; avatarUrl: string | null } | null;
  ledger: LedgerRow[];
  summary: { collected: number; dues: number; months: number; onTime: number; late: number; defaulted: number; onTimeRate: number | null };
  hasActiveTenancy: boolean;
  canMessage: boolean;
}

export type BehaviorFilter = "ALL" | Behavior | "UNRATED";
