import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { removeImage } from "@/modules/properties/service";

export const DELETE = route<{ id: string; imageId: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const p = await params;
  return removeImage(actor, idParam(p.id), idParam(p.imageId), req);
});
