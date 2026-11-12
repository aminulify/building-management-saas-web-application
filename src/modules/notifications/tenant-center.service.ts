import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { pageResult } from "@/lib/api/common";
import { dueDateFor, monthStart } from "@/modules/rent/billing";
import { isLate, ledgerState } from "@/modules/rent/history-math";
import { nextPayment } from "@/modules/rent/next-payment";

/** The four tabs of the tenant's "Your Activity" page. Each notification belongs to exactly one of them. */
export const TENANT_TABS = {
  payment: ["rent.invoice", "rent.payment", "rent.verified", "rent.reminder", "rent.adjusted", "payment."],
  services: ["maintenance.", "tenancy."],
  issues: ["rent.late", "sos.", "complaint."],
} as const;
export type TenantTab = keyof typeof TENANT_TABS;

/** `sos.update` repeats what the live emergency card already shows, so it never gets its own card. */
const HIDDEN = ["sos.update"];

export const tenantFeedQuery = z.object({
  tab: z.enum(["all", "payment", "services", "issues"]).default("all"),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const tabOf = (type: string): TenantTab | "other" =>
  (Object.entries(TENANT_TABS).find(([, p]) => p.some((x) => type.startsWith(x)))?.[0] as TenantTab | undefined) ?? "other";

const startsWith = (prefixes: readonly string[]): Prisma.NotificationWhereInput => ({ OR: prefixes.map((p) => ({ type: { startsWith: p } })) });

const whereFor = (actor: Actor, tab: z.infer<typeof tenantFeedQuery>["tab"]): Prisma.NotificationWhereInput => ({
  userId: actor.id, archivedAt: null, NOT: HIDDEN.map((type) => ({ type })),
  ...(tab === "all" ? {} : startsWith(TENANT_TABS[tab])),
});

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * `GET /tenant/notifications`: newest first, ten at a time. Each card also carries the LIVE state of the thing it is
 * about (the rent bill, the repair request, the emergency alert), so a button never shows for something already done.
 */
export async function tenantFeed(actor: Actor, q: z.infer<typeof tenantFeedQuery>) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const rows = await db.notification.findMany({ where: whereFor(actor, q.tab), orderBy: { id: "desc" }, take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const page = pageResult(rows, q.limit);
  const ids = (key: string, prefix: string) => [...new Set(page.items.filter((n) => n.type.startsWith(prefix)).map((n) => str((n.params as Record<string, unknown>)[key])).filter(Boolean))];
  const recordIds = [...new Set([...ids("recordId", "rent.")])];
  const requestIds = ids("requestId", "maintenance.");
  const alertIds = ids("alertId", "sos.");
  const [records, requests, alerts, unread] = await Promise.all([
    recordIds.length ? db.rentRecord.findMany({ where: { id: { in: recordIds }, agreement: { tenantId: actor.id } }, select: { id: true, total: true, paid: true, billingMonth: true, payments: { where: { status: "PENDING" }, select: { id: true }, take: 1 } } }) : [],
    requestIds.length ? db.maintenanceRequest.findMany({ where: { id: { in: requestIds }, tenantId: actor.id }, select: { id: true, status: true } }) : [],
    alertIds.length ? db.emergencyAlert.findMany({ where: { id: { in: alertIds }, reporterId: actor.id }, select: { id: true, type: true, status: true, acceptedAt: true } }) : [],
    db.notification.count({ where: { ...whereFor(actor, "all"), readAt: null } }),
  ]);
  const rec = new Map(records.map((r) => [r.id, r]));
  const req = new Map(requests.map((r) => [r.id, r]));
  const alt = new Map(alerts.map((a) => [a.id, a]));
  const now = new Date();

  return {
    nextCursor: page.nextCursor, unread,
    items: page.items.map((n) => {
      const p = n.params as Record<string, unknown>;
      const r = rec.get(str(p.recordId));
      const m = req.get(str(p.requestId));
      const a = alt.get(str(p.alertId));
      const month = r?.billingMonth.toISOString().slice(0, 7);
      const live = r
        ? { kind: "rent" as const, recordId: r.id, state: ledgerState({ total: Number(r.total), paid: Number(r.paid) }, r.payments.length > 0), owed: Math.max(0, Number(r.total) - Number(r.paid)).toFixed(2), total: r.total.toFixed(2), month: month!, late: isLate(month!, now) }
        : m ? { kind: "request" as const, id: m.id, status: m.status }
        : a ? { kind: "alert" as const, id: a.id, type: a.type, status: a.status, accepted: !!a.acceptedAt }
        : null;
      return { id: n.id, type: n.type, titleKey: n.titleKey, params: n.params, link: n.link, priority: n.priority, readAt: n.readAt, createdAt: n.createdAt, tab: tabOf(n.type), live };
    }),
  };
}

/**
 * `GET /tenant/notifications/summary`: the three cards on top and what the buttons need.
 *  - Next payment: the oldest unpaid month's due date, or next month's due date once everything is paid.
 *  - Pending tasks: repair requests that are not finished.
 *  - Quick issues: late (unpaid after the 5th) rent months + emergency alerts that are not closed yet.
 */
export async function tenantSummary(actor: Actor) {
  requireRole(actor, "TENANT", "GENERAL_USER"); // a Tenant-Free account sees the same pages (empty until a lease exists)
  const now = new Date();
  const agreement = await db.rentalAgreement.findFirst({ where: { tenantId: actor.id, status: "ACTIVE" }, select: { id: true, ownerId: true, rent: true, unit: { select: { utilityCharge: true } } } });
  const [records, tasks, alerts, owner, profile] = await Promise.all([
    agreement ? db.rentRecord.findMany({ where: { agreementId: agreement.id }, orderBy: { billingMonth: "desc" }, take: 24, include: { payments: { where: { status: "PENDING" }, select: { id: true }, take: 1 } } }) : [],
    db.maintenanceRequest.count({ where: { tenantId: actor.id, status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } } }),
    // closed = solved AND accepted by the tenant (or a false alarm): everything else still needs attention
    db.emergencyAlert.count({ where: { reporterId: actor.id, OR: [{ status: { in: ["NEED_ACTION", "PROCESSING"] } }, { status: "SOLVED", acceptedAt: null }] } }),
    agreement ? db.user.findUnique({ where: { id: agreement.ownerId }, select: { fullName: true, phone: true } }) : null,
    agreement ? db.ownerProfile.findUnique({ where: { userId: agreement.ownerId }, select: { bkashNumber: true } }) : null,
  ]);
  const lite = records.map((r) => ({ id: r.id, billingMonth: r.billingMonth, total: Number(r.total), paid: Number(r.paid), dueDate: r.dueDate, status: r.status }));
  const next = agreement ? nextPayment(lite, Number(agreement.rent) + Number(agreement.unit.utilityCharge), now) : null;
  const lateMonths = records.filter((r) => Number(r.total) - Number(r.paid) > 0.004 && isLate(r.billingMonth.toISOString().slice(0, 7), now)).length;
  const target = next?.recordId ? records.find((r) => r.id === next.recordId) : undefined;
  return {
    hasLease: !!agreement,
    nextPayment: next ? { recordId: next.recordId, month: next.month, dueDate: next.dueDate ?? dueDateFor(monthStart(now)), amount: next.amount.toFixed(2), state: next.state, pending: !!target?.payments.length } : null,
    pendingTasks: tasks,
    quickIssues: { total: lateMonths + alerts, ruleWarnings: lateMonths, alerts },
    owner: owner ? { fullName: owner.fullName } : null,
    payTo: profile?.bkashNumber ?? owner?.phone ?? null,
  };
}
