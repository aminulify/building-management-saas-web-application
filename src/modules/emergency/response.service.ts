import type { AlertStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { activeUserIds, notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import type { AlertActionName, alertActionSchema, alertListQuery, incidentCreateSchema } from "./schema";

/** architecture 8.2 */
const STATUS_RULES: Record<string, { from: AlertStatus[]; needsNote: boolean }> = {
  PROCESSING: { from: ["NEED_ACTION", "SOLVED"], needsNote: false },
  SOLVED: { from: ["PROCESSING"], needsNote: true },
  FALSE_ALARM: { from: ["NEED_ACTION", "PROCESSING"], needsNote: true },
};

export async function listAlerts(actor: Actor, q: z.infer<typeof alertListQuery>) {
  await authorize(actor, "sos:respond");
  const status = q.status === "UNSOLVED" ? { in: ["NEED_ACTION", "PROCESSING"] as AlertStatus[] } : (q.status as AlertStatus);
  const rows = await db.emergencyAlert.findMany({
    where: { status, ...(q.since ? { OR: [{ createdAt: { gt: q.since } }, { events: { some: { createdAt: { gt: q.since } } } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  // live feed order: NEED_ACTION first, then by time
  return rows.sort((a, b) => Number(b.status === "NEED_ACTION") - Number(a.status === "NEED_ACTION"));
}

export async function getAlert(actor: Actor, id: string) {
  await authorize(actor, "sos:respond");
  const a = await db.emergencyAlert.findUnique({ where: { id }, include: { events: { orderBy: { id: "asc" } } } });
  if (!a) throw new AppError("NOT_FOUND");
  return a;
}

export async function act(actor: Actor, id: string, action: AlertActionName, body: z.infer<typeof alertActionSchema>, req: Request) {
  await authorize(actor, "sos:respond");
  // Super Admin may only monitor and escalate (architecture 4.2); responding is the Gov Admin's job
  if (actor.role !== "GOV_ADMIN") throw new AppError("FORBIDDEN");
  const a = await db.emergencyAlert.findUnique({ where: { id } });
  if (!a) throw new AppError("NOT_FOUND");
  const need = (v: unknown, path: string) => { if (!v) throw new AppError("VALIDATION_ERROR", [{ path, code: "required" }]); };

  let alertData: Record<string, unknown> = {};
  let event: { action: "ACK" | "ASSIGN" | "FORWARD" | "STATUS" | "NOTE"; toStatus?: AlertStatus; forwardTo?: "POLICE_999" | "FIRE" | "AMBULANCE"; forwardRef?: string; note?: string } = { action: "NOTE", note: body.note };

  switch (action) {
    case "ack":
      if (a.status !== "NEED_ACTION") throw new AppError("INVALID_STATE", { from: a.status });
      alertData = { status: "PROCESSING", acknowledgedAt: new Date(), assignedOfficerId: a.assignedOfficerId ?? actor.id };
      event = { action: "ACK", toStatus: "PROCESSING", note: body.note };
      break;
    case "assign": {
      need(body.officerId, "officerId");
      const officer = await db.user.findFirst({ where: { id: body.officerId, role: "GOV_ADMIN", status: "ACTIVE" } });
      if (!officer) throw new AppError("VALIDATION_ERROR", [{ path: "officerId", code: "not_gov_admin" }]);
      alertData = { assignedOfficerId: officer.id };
      event = { action: "ASSIGN", note: officer.fullName };
      break;
    }
    case "forward":
      need(body.target, "target");
      if (a.status === "SOLVED" || a.status === "FALSE_ALARM") throw new AppError("INVALID_STATE", { from: a.status });
      // dispatching implies the alert was seen
      if (a.status === "NEED_ACTION") alertData = { status: "PROCESSING", acknowledgedAt: new Date(), assignedOfficerId: a.assignedOfficerId ?? actor.id };
      event = { action: "FORWARD", forwardTo: body.target, forwardRef: body.reference, note: body.note };
      break;
    case "status": {
      need(body.status, "status");
      const rule = STATUS_RULES[body.status!]!;
      if (!rule.from.includes(a.status)) throw new AppError("INVALID_STATE", { from: a.status, to: body.status });
      if (rule.needsNote) need(body.note, "note");
      alertData = { status: body.status, ...(body.status === "SOLVED" ? { resolvedAt: new Date() } : {}), ...(body.status === "PROCESSING" ? { resolvedAt: null } : {}) };
      event = { action: "STATUS", toStatus: body.status as AlertStatus, note: body.note };
      break;
    }
    case "notes":
      need(body.note, "note");
      break;
  }

  return db.$transaction(async (tx) => {
    const out = Object.keys(alertData).length ? await tx.emergencyAlert.update({ where: { id }, data: alertData }) : a;
    await tx.emergencyAlertEvent.create({ data: { alertId: id, actorId: actor.id, fromStatus: a.status, ...event } }); // append-only
    if (action !== "notes" && action !== "assign") {
      await notify([a.reporterId], { type: "sos.update", titleKey: "notifications.sosUpdate", params: { action, status: out.status }, link: "/tenant/sos", priority: "CRITICAL" }, tx);
      await tx.outboxEvent.create({ data: { type: "sos.update", payload: { alertId: id, reporterId: a.reporterId } } }); // socket sos:update
    }
    await writeAudit({ actor, action: `sos.${action}`, resourceType: "EmergencyAlert", resourceId: id, before: { status: a.status }, after: { status: out.status, ...(body.target ? { target: body.target, ref: body.reference ?? null } : {}) }, req }, tx);
    return out;
  });
}

/** Super Admin only: flag + re-alert every Gov Admin. */
export async function escalate(actor: Actor, id: string, req: Request) {
  if (actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  const a = await db.emergencyAlert.findUnique({ where: { id } });
  if (!a) throw new AppError("NOT_FOUND");
  if (a.status === "SOLVED" || a.status === "FALSE_ALARM") throw new AppError("INVALID_STATE", { from: a.status });
  return db.$transaction(async (tx) => {
    const out = await tx.emergencyAlert.update({ where: { id }, data: { escalated: true } });
    await tx.emergencyAlertEvent.create({ data: { alertId: id, actorId: actor.id, action: "ESCALATE", fromStatus: a.status } });
    await notify(await activeUserIds("GOV_ADMIN", tx), { type: "sos.escalated", titleKey: "notifications.sosEscalated", params: { type: a.type }, link: `/gov/quick-alert/${id}`, priority: "CRITICAL" }, tx);
    await writeAudit({ actor, action: "sos.escalate", resourceType: "EmergencyAlert", resourceId: id, req }, tx);
    return out;
  });
}

/** Super Admin monitoring: queue plus time-to-acknowledge / time-to-resolve. */
export async function adminOverview(actor: Actor) {
  await authorize(actor, "sos:respond");
  if (actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  const [open, recent, byStatus] = await Promise.all([
    db.emergencyAlert.findMany({ where: { status: { in: ["NEED_ACTION", "PROCESSING"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.emergencyAlert.findMany({ where: { createdAt: { gt: new Date(Date.now() - 30 * 86400_000) } }, select: { createdAt: true, acknowledgedAt: true, resolvedAt: true } }),
    db.emergencyAlert.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const avgMin = (pairs: [Date, Date | null][]) => {
    const v = pairs.filter((p): p is [Date, Date] => p[1] !== null).map(([a, b]) => (b.getTime() - a.getTime()) / 60000);
    return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null;
  };
  return {
    open,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    avgMinutesToAcknowledge: avgMin(recent.map((r) => [r.createdAt, r.acknowledgedAt])),
    avgMinutesToResolve: avgMin(recent.map((r) => [r.createdAt, r.resolvedAt])),
  };
}

export async function createIncident(actor: Actor, input: z.infer<typeof incidentCreateSchema>, req: Request) {
  await authorize(actor, "sos:respond");
  if (actor.role !== "GOV_ADMIN") throw new AppError("FORBIDDEN");
  if (input.alertId && !(await db.emergencyAlert.count({ where: { id: input.alertId } }))) throw new AppError("NOT_FOUND");
  const r = await db.incidentReport.create({ data: { ...input, officerId: actor.id } });
  await writeAudit({ actor, action: "incident.create", resourceType: "IncidentReport", resourceId: r.id, req });
  return r;
}

export async function listIncidents(actor: Actor) {
  await authorize(actor, "sos:respond");
  return db.incidentReport.findMany({ orderBy: { id: "desc" }, take: 50 });
}
