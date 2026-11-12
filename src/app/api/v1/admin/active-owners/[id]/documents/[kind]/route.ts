import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { docKindParam, documentReviewSchema } from "@/modules/admin/shared/document-review";
import { reviewOwnerDocument } from "@/modules/admin/owners/service";

/** Super Admin verifies or rejects the owner's NID front, NID back or agreement. */
export const PATCH = route<{ id: string; kind: string }>(async (req, { params }) => {
  const p = await params;
  return reviewOwnerDocument(await requireActor(req), idParam(p.id), docKindParam.parse(p.kind), await parseBody(req, documentReviewSchema), req);
});
