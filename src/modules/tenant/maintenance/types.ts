import type { Issue as OwnerIssue, IssueStatus, Priority, Stats } from "../../owner/maintenance/types";

export type { IssueStatus, Priority, Stats };
export type Tab = "all" | "active" | "completed";
export type Category = "PLUMBING" | "ELECTRICAL" | "GAS" | "LIFT" | "PAINT" | "SECURITY" | "CLEANING" | "OTHER";

/** One request in the tenant's list (GET /maintenance). */
export type Issue = OwnerIssue & { preferredAt: string | null };
export interface IssuesPage { items: Issue[]; nextCursor: string | null }

/** GET /maintenance/:id */
export interface IssueDetail {
  id: string; category: Category; title: string; description: string; priority: Priority; status: IssueStatus; preferredAt: string | null;
  images: { id: string; storageKey: string; url: string | null }[];
}

/** The apartment, unit and tenant that every request is filed under (read-only tags in the windows). */
export interface Context { property: string; unit: string; tenant: string }
