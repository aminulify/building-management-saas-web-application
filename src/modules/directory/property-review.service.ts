import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, requireRole } from "@/lib/authz/authorize";
import { activeUserIds, notify } from "@/lib/notify";
import { signStorageKey } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";

export const REVIEW_ACTIONS = ["verify", "reject", "request-docs", "suspend", "restore"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const reviewSchema = z.object({ notes: z.string().trim().min(3).max(500).optional() });

export const propertyDocSchema = z.object({ kind: z.enum(["DEED", "OTHER"]), storageKey: z.string().min(10).max(300) });

/** Owner attaches ownership documents to a property. */
export async function addPropertyDocument(actor: Actor, propertyId: string, input: z.infer<typeof propertyDocSchema>) {
  const p = await db.property.findUnique({ where: { id: propertyId } });
  if (!p) throw new AppError("NOT_FOUND");
  await authorize(actor, "property:manage", { ownerId: p.ownerId });
  if (input.storageKey.split("/")[1] !== actor.id || input.storageKey.split("/")[0] !== "PROPERTY_DOC") throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  const doc = await db.verificationDocument.create({ data: { ownerType: "PROPERTY", ownerId: propertyId, kind: input.kind, storageKey: input.storageKey } });
  if (p.verificationStatus === "UNVERIFIED" || p.verificationStatus === "REJECTED") {
    await db.property.update({ where: { id: propertyId }, data: { verificationStatus: "PENDING" } });
    await notify(await activeUserIds("SUPER_ADMIN"), { type: "property.verification", titleKey: "notifications.propertyVerification", params: { name: p.name }, link: `/admin/properties/${propertyId}` });
  }
  return doc;
}

/** Super Admin review screen: property + documents with 5-minute signed URLs. */
export async function getForReview(actor: Actor, id: string) {
  requireRole(actor, "SUPER_ADMIN");
  const p = await db.property.findUnique({ where: { id }, include: { address: true, zone: true, owner: { select: { id: true, fullName: true, ownerCode: true, verificationStatus: true } } } });
  if (!p) throw new AppError("NOT_FOUND");
  const docs = await db.verificationDocument.findMany({ where: { ownerType: "PROPERTY", ownerId: id }, orderBy: { id: "desc" } });
  const documents = await Promise.all(docs.map(async (d) => ({ id: d.id, kind: d.kind, status: d.status, createdAt: d.createdAt, url: (await signStorageKey(d.storageKey).catch(() => null))?.url ?? null })));
  return { ...p, documents };
}

const RULES: Record<ReviewAction, { to: { verificationStatus?: "VERIFIED" | "REJECTED" | "PENDING"; status?: "ACTIVE" | "SUSPENDED" }; needsNotes: boolean }> = {
  verify: { to: { verificationStatus: "VERIFIED" }, needsNotes: false },
  reject: { to: { verificationStatus: "REJECTED" }, needsNotes: true },
  "request-docs": { to: { verificationStatus: "PENDING" }, needsNotes: true },
  suspend: { to: { status: "SUSPENDED" }, needsNotes: true },
  restore: { to: { status: "ACTIVE" }, needsNotes: false },
};

export async function review(actor: Actor, id: string, action: ReviewAction, notes: string | undefined, req: Request) {
  requireRole(actor, "SUPER_ADMIN");
  const rule = RULES[action];
  if (rule.needsNotes && !notes) throw new AppError("VALIDATION_ERROR", [{ path: "notes", code: "required" }]);
  const before = await db.property.findUnique({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND");
  if (before.archivedAt) throw new AppError("INVALID_STATE", { reason: "archived" });
  return db.$transaction(async (tx) => {
    const p = await tx.property.update({ where: { id }, data: { ...rule.to, reviewNotes: notes ?? null, reviewedAt: new Date() } });
    if (rule.to.verificationStatus && rule.to.verificationStatus !== "PENDING") await tx.verificationDocument.updateMany({ where: { ownerType: "PROPERTY", ownerId: id, status: "PENDING" }, data: { status: rule.to.verificationStatus, reviewerId: actor.id, notes } });
    await notify([before.ownerId], { type: "property.review", titleKey: "notifications.propertyReview", params: { action, name: before.name, notes: notes ?? "" }, link: `/owner/properties/${id}` }, tx);
    await writeAudit({ actor, action: `property.${action}`, resourceType: "Property", resourceId: id, before: { status: before.status, verification: before.verificationStatus }, after: { ...rule.to, notes: notes ?? null }, req }, tx);
    return p;
  });
}

/** Gov Admin "Report Issue": flags a property to the Super Admin team without changing it. */
export async function reportIssue(actor: Actor, id: string, notes: string, req: Request) {
  requireRole(actor, "GOV_ADMIN");
  const p = await db.property.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!p) throw new AppError("NOT_FOUND");
  await notify(await activeUserIds("SUPER_ADMIN"), { type: "property.gov_issue", titleKey: "notifications.propertyGovIssue", params: { name: p.name, notes }, link: `/admin/properties/${id}`, priority: "HIGH" });
  await writeAudit({ actor, action: "property.report_issue", resourceType: "Property", resourceId: id, after: { notes }, req });
  return { reported: true };
}
