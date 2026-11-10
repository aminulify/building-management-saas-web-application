export type IssueStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
/** The three states the owner can pick in the status pill. */
export type PickStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type Tab = "all" | "pending" | "progress" | "completed";

export interface Issue {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: Priority;
  status: IssueStatus;
  technicianName: string | null;
  createdAt: string;
  coverUrl: string | null;
  unit: { unitNumber: string; floor: number | null; property: { name: string } };
  tenant: { id: string; fullName: string; username: string; phone: string | null };
}

export interface IssuesPage { items: Issue[]; nextCursor: string | null }

export interface Stats {
  total: number;
  resolutionRate: number;
  open: number;
  inProgress: number;
  critical: number;
  byStatus: Partial<Record<IssueStatus, number>>;
}
