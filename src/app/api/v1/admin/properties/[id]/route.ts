import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getForReview } from "@/modules/directory/property-review.service";
import { adminDeleteSchema, deleteProperty } from "@/modules/admin/properties/service";

/** Property verification screen: details + documents with short-lived signed URLs. */
export const GET = route<{ id: string }>(async (req, { params }) => getForReview(await requireActor(req), idParam((await params).id)));

/** Delete from the Super Admin Properties page: a soft delete with a reason and an optional note; tenants still living there are moved out. */
export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const text = await req.text();
  const body = text ? adminDeleteSchema.parse(JSON.parse(text)) : undefined;
  return deleteProperty(actor, idParam((await params).id), req, body);
});
