import type { AlertStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { activeUserIds, notify } from "@/lib/notify";
import { setPoint } from "@/lib/geo-point";
import type { Actor } from "@/lib/auth/require-actor";
import type { sosCreateSchema } from "./schema";

const DEDUPE_MS = 3 * 60_000;

/** Where is the reporter? Owner → first active property; tenant → active agreement's unit and property. */
async function reporterContext(actor: Actor) {
  if (actor.role === "TENANT") {
    const a = await db.rentalAgreement.findFirst({
      where: { tenantId: actor.id, status: "ACTIVE" },
      include: { unit: { include: { property: { include: { address: true } } } } },
    });
    if (a) return { propertyId: a.unit.propertyId, unitId: a.unitId, snapshot: { property: a.unit.property.name, unit: a.unit.unitNumber, floor: a.unit.floor, address: a.unit.property.address } };
  } else {
    const p = await db.property.findFirst({ where: { ownerId: actor.id, archivedAt: null }, include: { address: true }, orderBy: { id: "asc" } });
    if (p) return { propertyId: p.id, unitId: undefined, snapshot: { property: p.name, unit: null, floor: null, address: p.address } };
  }
  return { propertyId: undefined, unitId: undefined, snapshot: { property: null, unit: null, floor: null, address: null } };
}

/**
 * Committed to the DB first (alert + first event + CRITICAL notifications + outbox row in one transaction);
 * socket/SMS fan-out is picked up from the outbox, so a failure there never loses the alert (architecture 8).
 */
export async function raiseSos(actor: Actor, input: z.infer<typeof sosCreateSchema>, req: Request) {
  await authorize(actor, "sos:create");

  const recent = await db.emergencyAlert.findFirst({
    where: { reporterId: actor.id, type: input.type, createdAt: { gt: new Date(Date.now() - DEDUPE_MS) } },
    orderBy: { id: "desc" },
  });
  if (recent) return { alert: recent, deduped: true };

  const lastHour = await db.emergencyAlert.count({ where: { reporterId: actor.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (lastHour >= 5) throw new AppError("RATE_LIMITED", { reason: "sos_hourly_limit" });

  const [me, ctx] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true, phone: true, nidLast4: true, username: true } }),
    reporterContext(actor),
  ]);

  const alert = await db.$transaction(async (tx) => {
    const a = await tx.emergencyAlert.create({
      data: {
        reporterId: actor.id, propertyId: ctx.propertyId, unitId: ctx.unitId, type: input.type, description: input.description,
        addressSnapshot: JSON.parse(JSON.stringify({ ...ctx.snapshot, reported: { service: input.service ?? null, thana: input.thana ?? null, locationText: input.locationText ?? null, district: input.district ?? null } })),
        reporterSnapshot: { name: input.reporterName ?? me.fullName, username: me.username, phone: input.contactPhone ?? me.phone, nidLast4: me.nidLast4, accountName: me.fullName },
        priority: input.type === "FIRE" || input.type === "MEDICAL" ? "CRITICAL" : "HIGH",
        dedupeKey: `${actor.id}:${input.type}`,
        events: { create: { actorId: actor.id, action: "STATUS", toStatus: "NEED_ACTION", note: "created" } },
      },
    });
    if (input.lat !== undefined && input.lng !== undefined) await setPoint(tx, "EmergencyAlert", a.id, input.lat, input.lng);
    else if (ctx.propertyId) await tx.$executeRaw`UPDATE "EmergencyAlert" SET "location" = (SELECT "location" FROM "Property" WHERE id = ${ctx.propertyId}::uuid) WHERE id = ${a.id}::uuid`;

    const recipients = [...(await activeUserIds("GOV_ADMIN", tx)), ...(await activeUserIds("SUPER_ADMIN", tx))];
    await notify(recipients, { type: "sos.new", titleKey: "notifications.sosNew", params: { type: input.type, reporter: me.fullName }, link: `/gov/quick-alert/${a.id}`, priority: "CRITICAL" }, tx);
    await tx.outboxEvent.create({ data: { type: "sos.new", payload: { alertId: a.id, type: input.type } } }); // socket sos:new + SMS to on-duty phones
    await writeAudit({ actor, action: "sos.create", resourceType: "EmergencyAlert", resourceId: a.id, after: { type: input.type }, req }, tx);
    return a;
  });
  return { alert, deduped: false };
}

/** What the reporter sees. Never claims police received it unless a forward reference exists (spec 5.8, D11). */
export function stageOf(a: { status: AlertStatus; acknowledgedAt: Date | null; events: { action: string; forwardRef: string | null; forwardTo: string | null }[] }) {
  if (a.status === "SOLVED") return { stage: "SOLVED" as const };
  const fwd = a.events.find((e) => e.action === "FORWARD");
  if (fwd) return { stage: "FORWARDED" as const, forwardTo: fwd.forwardTo, forwardRef: fwd.forwardRef };
  if (a.acknowledgedAt) return { stage: "SEEN_BY_GOV" as const };
  return { stage: "RECEIVED_BY_PLATFORM" as const };
}

export async function myAlerts(actor: Actor) {
  const rows = await db.emergencyAlert.findMany({
    where: { reporterId: actor.id }, orderBy: { id: "desc" }, take: 30,
    select: { id: true, type: true, status: true, acknowledgedAt: true, resolvedAt: true, createdAt: true, events: { select: { action: true, forwardRef: true, forwardTo: true } } },
  });
  return rows.map(({ events, ...a }) => ({ ...a, ...stageOf({ ...a, events }) }));
}
