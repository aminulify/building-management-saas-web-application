import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz/authorize";
import { notify } from "@/lib/notify";
import { signStorageKeys } from "@/modules/uploads/service";
import type { Actor } from "@/lib/auth/require-actor";
import { resolveOwnerNotices } from "@/lib/authz/owner-readiness";

/** NID front, NID back and agreement review: the same for tenants and owners. */
export const DOC_KINDS = ["NID_FRONT", "NID_BACK", "AGREEMENT"] as const;
export type DocKindName = (typeof DOC_KINDS)[number];

export const addressText = (a: { division: string; district: string; upazila: string | null; union: string | null; street: string | null; postOffice: string | null } | null | undefined) =>
  a ? [a.street, a.union, a.postOffice, a.upazila, a.district, a.division].filter(Boolean).join(", ") : null;

type DocRow = { id: string; kind: string; status: string; notes: string | null; storageKey: string; createdAt: Date };
const isPdf = (key: string) => /\.pdf$/i.test(key);

/**
 * The three documents for the review: the newest upload of each kind with a picture link, its state and note.
 * When the tenant has not uploaded an agreement the landlord's copy of the lease is shown (view only: there is nothing to review).
 */
export async function documentViews(docs: DocRow[], landlord: { agreementDocKey: string | null; updatedAt: Date } | null) {
  const latest = (kind: DocKindName) => docs.find((d) => d.kind === kind) ?? null;
  const urls = await signStorageKeys([...DOC_KINDS.flatMap((k) => latest(k)?.storageKey ?? []), ...(landlord?.agreementDocKey ? [landlord.agreementDocKey] : [])], 3600);
  const view = (kind: DocKindName) => {
    const d = latest(kind);
    if (d) return { id: d.id, source: "TENANT" as const, status: d.status, notes: d.notes, uploadedAt: d.createdAt, url: urls.get(d.storageKey) ?? null, isPdf: isPdf(d.storageKey), reviewable: true, locked: d.status === "VERIFIED" };
    if (kind === "AGREEMENT" && landlord?.agreementDocKey) return { id: null, source: "LANDLORD" as const, status: "VERIFIED", notes: null, uploadedAt: landlord.updatedAt, url: urls.get(landlord.agreementDocKey) ?? null, isPdf: isPdf(landlord.agreementDocKey), reviewable: false, locked: false };
    return null;
  };
  return { nidFront: view("NID_FRONT"), nidBack: view("NID_BACK"), agreement: view("AGREEMENT") };
}

/** Verify or reject one document of the tenant. A verified document is locked on the tenant side; the tenant is told which one and why. */
export const documentReviewSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().trim().min(3).max(300).optional(),
}).strict().superRefine((v, ctx) => { if (v.decision === "REJECTED" && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "note_required" }); });

export const docKindParam = z.enum(DOC_KINDS);

/**
 * Verify or reject one document of a person. A verified document is locked for the person (the upload service refuses a replacement);
 * the person gets a notification that names the document. The NID state of the person follows the two NID photos.
 */
export async function reviewUserDocument(actor: Actor, userId: string, kind: DocKindName, input: z.infer<typeof documentReviewSchema>, req: Request, link: string) {
  requireRole(actor, "SUPER_ADMIN");
  return db.$transaction(async (tx) => {
    const doc = await tx.verificationDocument.findFirst({ where: { ownerType: "USER", ownerId: userId, kind }, orderBy: { id: "desc" }, select: { id: true, status: true } });
    if (!doc) throw new AppError("NOT_FOUND");
    if (doc.status === input.decision && (input.decision === "VERIFIED" || !input.note)) return { kind, status: doc.status, changed: false as const, tenantVerification: null };
    const note = input.decision === "REJECTED" ? input.note! : null;
    await tx.verificationDocument.update({ where: { id: doc.id }, data: { status: input.decision, reviewerId: actor.id, notes: note } });

    // the NID state follows the two NID photos: both verified = Verified, any rejected = Rejected, otherwise waiting
    const nid = await tx.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: userId, kind: { in: ["NID_FRONT", "NID_BACK"] } }, orderBy: { id: "desc" }, select: { kind: true, status: true } });
    const front = nid.find((d) => d.kind === "NID_FRONT"), back = nid.find((d) => d.kind === "NID_BACK");
    let tenantVerification: "VERIFIED" | "REJECTED" | "PENDING" | null = null;
    if (front && back) tenantVerification = front.status === "VERIFIED" && back.status === "VERIFIED" ? "VERIFIED" : front.status === "REJECTED" || back.status === "REJECTED" ? "REJECTED" : "PENDING";
    if (tenantVerification && kind !== "AGREEMENT") await tx.user.update({ where: { id: userId }, data: { verificationStatus: tenantVerification } });
    if (tenantVerification === "VERIFIED") await resolveOwnerNotices(userId, ["nid"], tx);

    await notify([userId], input.decision === "VERIFIED"
      ? { type: "document.verified", titleKey: "notifications.documentVerified", params: { document: kind }, link }
      : { type: "document.rejected", titleKey: "notifications.documentRejected", params: { document: kind, reason: note ?? "" }, link, priority: "HIGH" }, tx);
    await writeAudit({ actor, action: `document.${input.decision.toLowerCase()}`, resourceType: "VerificationDocument", resourceId: doc.id, before: { status: doc.status }, after: { status: input.decision, kind, note, userId }, req }, tx);
    return { kind, status: input.decision, changed: true as const, tenantVerification };
  });
}
