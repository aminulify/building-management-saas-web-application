import { z } from "zod";
import { PRIORITIES, REPAIR_CATEGORIES } from "../dashboard/logic";
import type { Context, Issue, IssueStatus, Priority, Stats, Tab } from "./types";

export const FIRST_PAGE = 3;
export const NEXT_PAGE = 5;
export const MAX_PHOTOS = 5;

const OPEN: IssueStatus[] = ["PENDING", "APPROVED"];
const ACTIVE: IssueStatus[] = ["PENDING", "APPROVED", "IN_PROGRESS"];

/** Three issues on the first load, then five per "Load More". "Active" = Pending + In Progress, "Completed" = Completed. */
export function listQuery(tab: Tab, cursor?: string | null): string {
  const p = new URLSearchParams({ limit: String(cursor ? NEXT_PAGE : FIRST_PAGE) });
  if (tab === "active") p.set("statuses", ACTIVE.join(","));
  if (tab === "completed") p.set("statuses", "COMPLETED");
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

/** Does a request with this status belong to the tab? (a card that just moved leaves the tab) */
export const inTab = (tab: Tab, status: IssueStatus): boolean => tab === "all" || (tab === "active" ? ACTIVE.includes(status) : status === "COMPLETED");

/** The three number cards: Active (waiting + being fixed), Completed, Pending (not started). */
export function cards(s: Stats) {
  return { active: s.open + s.inProgress, completed: s.byStatus.COMPLETED ?? 0, pending: s.open };
}
export const tabCount = (tab: Tab, s: Stats): number => (tab === "all" ? s.total : tab === "active" ? cards(s).active : cards(s).completed);

/** Numbers after a request changes status (`to`), is removed (`null`) or is created (`from` = null). The server's numbers replace them a moment later. */
export function moveStats(s: Stats, priority: Priority, from: IssueStatus | null, to: IssueStatus | null): Stats {
  const by = { ...s.byStatus };
  if (from) by[from] = Math.max(0, (by[from] ?? 0) - 1);
  if (to) by[to] = (by[to] ?? 0) + 1;
  const sum = (list: IssueStatus[]) => list.reduce((a, k) => a + (by[k] ?? 0), 0);
  const crit = (st: IssueStatus | null) => (priority === "CRITICAL" && st && ACTIVE.includes(st) ? 1 : 0);
  const total = s.total + (from ? 0 : 1) - (to ? 0 : 1);
  return { ...s, byStatus: by, total, open: sum(OPEN), inProgress: sum(["IN_PROGRESS"]), critical: Math.max(0, s.critical + crit(to) - crit(from)), resolutionRate: total ? Math.round(((by.COMPLETED ?? 0) * 100) / total) : 0 };
}

/** What the "Condition" select shows: an Approved request still counts as Pending for the tenant. */
export type UiStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export const uiStatus = (s: IssueStatus): UiStatus => (s === "IN_PROGRESS" ? "IN_PROGRESS" : s === "COMPLETED" ? "COMPLETED" : "PENDING");
/** Rejected and cancelled requests are closed: they cannot be edited. */
export const canEdit = (s: IssueStatus) => s !== "REJECTED" && s !== "CANCELLED";
/** Words, priority, photo and time are locked once work starts, unless the tenant reopens a completed request. */
export const contentLocked = (original: IssueStatus, chosen: UiStatus) => !OPEN.includes(original) && !(original === "COMPLETED" && chosen === "PENDING");

export const photoProblem = (f: { type: string; size: number }): "type" | "size" | null =>
  !["image/jpeg", "image/png", "image/webp"].includes(f.type) ? "type" : f.size > 5 * 1024 * 1024 ? "size" : null;

/** `<input type="datetime-local">` value → ISO moment with the viewer's offset ("" → undefined). */
export function preferredIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
/** ISO moment → `datetime-local` value in the viewer's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const preferred = z.string().refine((v) => {
  if (!v) return true;
  const t = new Date(v).getTime();
  return !Number.isNaN(t) && t > Date.now() - 5 * 60_000;
}, "preferredPast").refine((v) => !v || new Date(v).getTime() < Date.now() + 365 * 86_400_000, "preferredFar");

const base = {
  priority: z.enum(PRIORITIES),
  title: z.string().trim().min(3, "titleShort").max(120, "titleLong"),
  description: z.string().trim().min(5, "descShort").max(2000, "descLong"),
  preferred,
};
/** One form for both windows; "+ New Request" always starts as Pending and does not show the condition. */
export const requestSchema = z.object({ category: z.enum(REPAIR_CATEGORIES), status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]), ...base });
export type RequestValues = z.input<typeof requestSchema>;

/** The list card for a request the tenant just created (the server answer has no unit or tenant). */
export function issueFrom(r: { id: string; category: string; title: string; description: string; priority: Priority; status: IssueStatus; createdAt: string; preferredAt?: string | null }, ctx: Context, coverUrl: string | null): Issue {
  return { id: r.id, category: r.category, title: r.title, description: r.description, priority: r.priority, status: r.status, technicianName: null, createdAt: r.createdAt, preferredAt: r.preferredAt ?? null, coverUrl, unit: { unitNumber: ctx.unit, floor: null, property: { name: ctx.property } }, tenant: { id: "", fullName: ctx.tenant, username: "", phone: null } };
}
