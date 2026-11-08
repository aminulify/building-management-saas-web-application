import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { idParam } from "@/lib/api/common";
import { getUserForReview, updateUser } from "@/modules/auth/admin-users.service";
import { userEditSchema } from "@/modules/auth/schema";

/** User detail incl. the NID, for manual verification. Super Admin only; each view is audited. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "user:manage");
  return getUserForReview(actor, idParam((await params).id), req);
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "user:manage");
  return updateUser(actor, idParam((await params).id), await parseBody(req, userEditSchema), req);
});
