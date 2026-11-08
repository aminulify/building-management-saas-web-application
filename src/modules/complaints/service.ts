import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { activeUserIds, notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import type { ComplaintAction, complaintActionSchema, complaintCreateSchema, complaintListQuery } from "./schema";

export async function createComplaint(actor: Actor, input: z.infer<typeof complaintCreateSchema>, req: Request) {
  await authorize(actor, "complaint:create");
  for (const k of input.evidence) if (k.split("/")[0] !== "COMPLAINT_EVIDENCE" || k.split("/")[1] !== actor.id) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  return db.$transaction(async (tx) => {
    const c = await tx.complaint.create({ data: { ...input, reporterId: actor.id, events: { create: { actorId: actor.id, action: "CREATED" } } } });
    await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "complaint.new", titleKey: "notifications.complaintNew", params: { subject: c.subject }, link: `/admin/complaints/${c.id}` }, tx);
    await writeAudit({ actor, action: "complaint.create", resourceType: "Complaint", resourceId: c.id, req }, tx);
    return c;
  });
}

/** Reporter: own. Gov admin: assigned. Super admin: all. */
function visibility(actor: Actor) {
  if (actor.role === "SUPER_ADMIN") return {};
  if (actor.role === "GOV_ADMIN") return { assignedToId: actor.id };
  return { reporterId: actor.id };
}

export async function listComplaints(actor: Actor, q: z.infer<typeof complaintListQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "complaint:manage", { ownerId: actor.id, assigneeId: actor.id });
  const rows = await db.complaint.findMany({ where: { ...visibility(actor), status: q.status }, ...pageArgs(page) });
  return pageResult(rows, page.limit);
}

async function load(actor: Actor, id: string) {
  const c = await db.complaint.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND");
  await authorize(actor, "complaint:manage", { ownerId: c.reporterId, assigneeId: c.assignedToId ?? undefined });
  return c;
}

export async function getComplaint(actor: Actor, id: string) {
  await load(actor, id);
  return db.complaint.findUnique({ where: { id }, include: { events: { orderBy: { id: "asc" } } } });
}

export async function act(actor: Actor, id: string, action: ComplaintAction, body: z.infer<typeof complaintActionSchema>, req: Request) {
  const c = await load(actor, id);
  const isAdmin = actor.role === "SUPER_ADMIN";
  const isStaff = isAdmin || actor.role === "GOV_ADMIN";
  const need = (cond: boolean) => { if (!cond) throw new AppError("FORBIDDEN", { action }); };
  const require = (v: unknown, path: string) => { if (!v) throw new AppError("VALIDATION_ERROR", [{ path, code: "required" }]); };

  let data: Record<string, unknown> = {};
  let toNotify: string[] = [c.reporterId];
  switch (action) {
    case "assign": {
      need(isAdmin); require(body.assigneeId, "assigneeId");
      const gov = await db.user.findFirst({ where: { id: body.assigneeId, role: "GOV_ADMIN", status: "ACTIVE" } });
      if (!gov) throw new AppError("VALIDATION_ERROR", [{ path: "assigneeId", code: "not_gov_admin" }]);
      data = { assignedToId: gov.id, status: "IN_REVIEW" }; toNotify = [gov.id];
      break;
    }
    case "status":
      need(isStaff); require(body.status, "status");
      if (c.status === "RESOLVED") throw new AppError("INVALID_STATE", { from: c.status });
      data = { status: body.status, ...(body.status === "REJECTED" ? { resolution: body.note } : {}) };
      break;
    case "notes":
      need(isStaff || actor.id === c.reporterId); require(body.note, "note");
      break; // event only
    case "resolve":
      need(isStaff); require(body.resolution, "resolution");
      if (c.status === "RESOLVED") throw new AppError("INVALID_STATE", { from: c.status });
      data = { status: "RESOLVED", resolution: body.resolution };
      break;
    case "reopen":
      need(actor.id === c.reporterId || isAdmin);
      if (c.status !== "RESOLVED" && c.status !== "REJECTED") throw new AppError("INVALID_STATE", { from: c.status });
      data = { status: "REOPENED" }; toNotify = c.assignedToId ? [c.assignedToId] : await activeUserIds("SUPER_ADMIN");
      break;
  }

  return db.$transaction(async (tx) => {
    const out = Object.keys(data).length ? await tx.complaint.update({ where: { id }, data }) : c;
    await tx.complaintEvent.create({ data: { complaintId: id, actorId: actor.id, action: action.toUpperCase(), note: body.note ?? body.resolution } });
    await notify(toNotify.filter((u) => u !== actor.id), { type: "complaint.update", titleKey: "notifications.complaintUpdate", params: { action, subject: c.subject } }, tx);
    await writeAudit({ actor, action: `complaint.${action}`, resourceType: "Complaint", resourceId: id, before: { status: c.status }, after: JSON.parse(JSON.stringify(data)), req }, tx);
    return out;
  });
}
