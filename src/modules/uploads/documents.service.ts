import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { activeUserIds, notify } from "@/lib/notify";
import type { Actor } from "@/lib/auth/require-actor";
import { keyBelongsTo, keyPurpose } from "./service";

export const documentSchema = z.object({
  kind: z.enum(["NID_FRONT", "NID_BACK", "AGREEMENT", "OTHER"]),
  storageKey: z.string().min(10).max(300),
});

/** Registers an uploaded identity document. Once NID front and back exist the account is queued for manual review. */
export async function addMyDocument(actor: Actor, input: z.infer<typeof documentSchema>, req: Request) {
  if (!keyBelongsTo(input.storageKey, actor.id)) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  const purpose = keyPurpose(input.storageKey);
  const expected = input.kind === "OTHER" || input.kind === "AGREEMENT" ? "VERIFICATION_DOC" : input.kind;
  if (purpose !== expected) throw new AppError("VALIDATION_ERROR", [{ path: "storageKey", code: "wrong_upload_purpose" }]);

  return db.$transaction(async (tx) => {
    // replacing a document of the same kind keeps only the newest one for review
    if (input.kind !== "OTHER") await tx.verificationDocument.deleteMany({ where: { ownerType: "USER", ownerId: actor.id, kind: input.kind, status: { not: "VERIFIED" } } });
    const doc = await tx.verificationDocument.create({ data: { ownerType: "USER", ownerId: actor.id, kind: input.kind, storageKey: input.storageKey } });
    const kinds = new Set((await tx.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: actor.id }, select: { kind: true } })).map((d) => d.kind));
    if (kinds.has("NID_FRONT") && kinds.has("NID_BACK")) {
      const u = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { verificationStatus: true } });
      if (u.verificationStatus === "UNVERIFIED" || u.verificationStatus === "REJECTED") {
        await tx.user.update({ where: { id: actor.id }, data: { verificationStatus: "PENDING" } });
        await notify(await activeUserIds("SUPER_ADMIN", tx), { type: "verification.pending", titleKey: "notifications.verificationPending", params: { user: actor.username }, link: `/admin/users/${actor.id}` }, tx);
      }
    }
    await writeAudit({ actor, action: "document.add", resourceType: "VerificationDocument", resourceId: doc.id, after: { kind: input.kind }, req }, tx);
    return doc;
  });
}

export const myDocuments = (actor: Actor) =>
  db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: actor.id }, select: { id: true, kind: true, status: true, notes: true, createdAt: true }, orderBy: { id: "desc" } });
