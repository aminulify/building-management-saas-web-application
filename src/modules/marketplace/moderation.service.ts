import type { ListingStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz/authorize";
import { getEntitlement } from "@/lib/authz/entitlement";
import { notify } from "@/lib/notify";
import { computeFacilityDistances } from "@/modules/geo/facilities.service";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import type { ModAction, adminListingsQuery, modBodySchema } from "./schema";

const FLOW: Record<Exclude<ModAction, "flag">, { from: ListingStatus[]; to?: ListingStatus; needsReason: boolean }> = {
  approve: { from: ["PENDING"], to: "PUBLISHED", needsReason: false },
  reject: { from: ["PENDING"], to: "REJECTED", needsReason: true },
  suspend: { from: ["PUBLISHED"], to: "SUSPENDED", needsReason: true },
  restore: { from: ["SUSPENDED"], to: "PUBLISHED", needsReason: false },
  feature: { from: ["PUBLISHED"], needsReason: false },
  unfeature: { from: ["PUBLISHED"], needsReason: false },
};

/** Super Admin and Gov Admin (read-only) may review the queue. */
export async function adminList(actor: Actor, q: z.infer<typeof adminListingsQuery>, page: z.infer<typeof pageQuery>) {
  await authorize(actor, "listing:moderate", { readOnly: true });
  const rows = await db.listing.findMany({
    where: { status: q.status },
    include: { seller: { select: { id: true, fullName: true, username: true } }, _count: { select: { reports: true } }, images: { take: 1 } },
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

export async function listReports(actor: Actor, listingId: string) {
  await authorize(actor, "listing:moderate", { readOnly: true });
  return db.listingReport.findMany({ where: { listingId }, orderBy: { id: "desc" }, take: 50 });
}

/** Gov Admin can only flag (creates a report); Super Admin runs the full moderation workflow. */
export async function moderate(actor: Actor, id: string, action: ModAction, body: z.infer<typeof modBodySchema>, req: Request) {
  const l = await db.listing.findUnique({ where: { id } });
  if (!l) throw new AppError("NOT_FOUND");

  if (action === "flag") {
    await authorize(actor, "listing:moderate", { readOnly: true });
    if (actor.role !== "GOV_ADMIN") throw new AppError("FORBIDDEN", { reason: "gov_only" });
    if (!body.reason) throw new AppError("VALIDATION_ERROR", [{ path: "reason", code: "required" }]);
    const r = await db.listingReport.create({ data: { listingId: id, reporterId: actor.id, category: "GOV_FLAG", description: body.reason } });
    await writeAudit({ actor, action: "listing.flag", resourceType: "Listing", resourceId: id, after: { reason: body.reason }, req });
    return r;
  }

  await authorize(actor, "listing:moderate");
  const rule = FLOW[action];
  if (!rule.from.includes(l.status)) throw new AppError("INVALID_STATE", { from: l.status, action });
  if (rule.needsReason && !body.reason) throw new AppError("VALIDATION_ERROR", [{ path: "reason", code: "required" }]);

  return db.$transaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (rule.to) data.status = rule.to;
    if (action === "approve" || action === "restore") {
      const ent = await getEntitlement(l.sellerId, "SELLER", tx);
      const own = ent.status === "NONE" ? await getEntitlement(l.sellerId, "OWNER", tx) : ent;
      data.expiresAt = new Date(Date.now() + (own.limits.listingDurationDays || 30) * 86400_000);
      data.rejectionReason = null;
    }
    if (action === "reject" || action === "suspend") data.rejectionReason = body.reason;
    if (action === "feature") data.isFeatured = true;
    if (action === "unfeature") data.isFeatured = false;

    const out = await tx.listing.update({ where: { id }, data });
    if (action === "approve" || action === "restore") await computeFacilityDistances(id, tx);
    if (action !== "feature" && action !== "unfeature") {
      await notify([l.sellerId], { type: "listing.moderated", titleKey: "notifications.listingModerated", params: { action, title: l.title, reason: body.reason ?? "" }, link: "/marketplace/my-listings" }, tx);
    }
    await writeAudit({ actor, action: `listing.${action}`, resourceType: "Listing", resourceId: id, before: { status: l.status }, after: { status: out.status, reason: body.reason ?? null }, req }, tx);
    return out;
  });
}
