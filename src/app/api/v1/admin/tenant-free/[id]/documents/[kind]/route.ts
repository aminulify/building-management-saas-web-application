import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { docKindParam, documentReviewSchema } from "@/modules/admin/shared/document-review";
import { reviewFreeDocument } from "@/modules/admin/tenant-free/service";

/** Super Admin verifies or rejects the NID front or back of a Tenant-Free account. */
export const PATCH = route<{ id: string; kind: string }>(async (req, { params }) => {
  const p = await params;
  return reviewFreeDocument(await requireActor(req), idParam(p.id), docKindParam.parse(p.kind), await parseBody(req, documentReviewSchema), req);
});
