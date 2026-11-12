export type SubState = "ACTIVE" | "EXPIRING" | "EXPIRED";
export type PlanFilter = "all" | "PRIMARY" | "MILLIONAIRE" | "BILLIONAIRE";
export type StatusFilter = "all" | SubState;
export type Audience = "expiring" | "expired" | "all";

export interface SubStats {
  active: number; newThisWeek: number; expiringDays: number; plans: Record<"PRIMARY" | "MILLIONAIRE" | "BILLIONAIRE", number>; expired: number; expiring: number;
  boost: { active: number; paid: number; revenue: string }; revenueMonth: { amount: string; payments: number };
}
export interface PlanRef { code: string; nameEn: string; nameBn: string }
export interface SubRow {
  id: string; userId: string; state: SubState; status: string; cycle: string; months: number; paid: boolean; amount: string; startsAt: string | null; endsAt: string | null; daysLeft: number | null;
  owner: { fullName: string; ownerCode: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
  plan: PlanRef; usage: { properties: number; units: number; propertyLimit: number; unitLimit: number };
}
export interface SubPage { items: SubRow[]; total: number; page: number; pageSize: number }
export interface ReminderPreview { audience: Audience; count: number; totalDue: string; sample: string[]; expiringDays: number }
export interface SubDetails {
  id: string; userId: string; state: SubState; status: string; cycle: string; months: number; amount: string; startsAt: string | null; endsAt: string | null; graceEndsAt: string | null; autoRenew: boolean; daysLeft: number | null;
  owner: { fullName: string; ownerCode: string | null; phone: string | null; email: string | null; avatarUrl: string | null; memberSince: string };
  plan: PlanRef & { monthlyPrice: string };
  usage: { properties: number; units: number; listings: number; propertyLimit: number; unitLimit: number; listingLimit: number };
  boosts: number; payments: { id: string; trxId: string; amount: string; status: string; createdAt: string; verifiedAt: string | null; invoice: string | null }[];
}
