import type { Issue, IssueStatus, PickStatus, Stats, Tab } from "./types";

export const PAGE_SIZE = 4;
export const PICKABLE: IssueStatus[] = ["PENDING", "APPROVED", "IN_PROGRESS", "COMPLETED"];
export const PICK_OPTIONS: PickStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED"];
const OPEN: IssueStatus[] = ["PENDING", "APPROVED"];
const ACTIVE: IssueStatus[] = ["PENDING", "APPROVED", "IN_PROGRESS"];

/** The tab → the statuses the list asks for ("Pending" also holds requests the owner already approved). */
export function listQuery(tab: Tab, cursor?: string | null): string {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (tab === "pending") p.set("statuses", "PENDING,APPROVED");
  if (tab === "progress") p.set("statuses", "IN_PROGRESS");
  if (tab === "completed") p.set("statuses", "COMPLETED");
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

/** Does an issue with this status belong to the tab? (used to drop a card that just moved to another tab) */
export function inTab(tab: Tab, status: IssueStatus): boolean {
  return tab === "all" || (tab === "pending" && OPEN.includes(status)) || (tab === "progress" && status === "IN_PROGRESS") || (tab === "completed" && status === "COMPLETED");
}

/** The status pill picker is offered for live requests only (a rejected or cancelled one stays as it is). */
export const canPick = (status: IssueStatus) => PICKABLE.includes(status);

/** Update the top cards at once when a request changes status or is deleted; the server numbers replace them a moment later. */
export function adjustStats(s: Stats, issue: Pick<Issue, "priority" | "status">, to: IssueStatus | null): Stats {
  const from = issue.status;
  const by = { ...s.byStatus };
  by[from] = Math.max(0, (by[from] ?? 0) - 1);
  if (to) by[to] = (by[to] ?? 0) + 1;
  const sum = (list: IssueStatus[]) => list.reduce((a, k) => a + (by[k] ?? 0), 0);
  const critical = s.critical + (issue.priority === "CRITICAL" ? (to && ACTIVE.includes(to) ? 1 : 0) - (ACTIVE.includes(from) ? 1 : 0) : 0);
  const total = s.total - (to ? 0 : 1);
  return { ...s, byStatus: by, total, open: sum(OPEN), inProgress: sum(["IN_PROGRESS"]), critical: Math.max(0, critical), resolutionRate: total ? Math.round(((by.COMPLETED ?? 0) * 100) / total) : 0 };
}

/** Count shown on a tab. */
export function tabCount(tab: Tab, s: Stats): number {
  return tab === "all" ? s.total : tab === "pending" ? s.open : tab === "progress" ? s.inProgress : (s.byStatus.COMPLETED ?? 0);
}
