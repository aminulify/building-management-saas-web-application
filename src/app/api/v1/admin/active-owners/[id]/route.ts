import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveOwner, ownerArchiveSchema, ownerDetails } from "@/modules/admin/owners/service";

export const GET = route<{ id: string }>(async (req, { params }) => ownerDetails(await requireActor(req), idParam((await params).id)));
/** "Delete owner": moves the owner to Previous Owners. */
export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const text = await req.text();
  const body = text ? ownerArchiveSchema.parse(JSON.parse(text)) : {};
  return archiveOwner(actor, idParam((await params).id), body, req);
});
