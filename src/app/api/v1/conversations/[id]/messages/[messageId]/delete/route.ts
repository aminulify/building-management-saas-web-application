import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { deleteForSelf } from "@/modules/messaging/extras.service";

/** Delete for self. */
export const POST = route<{ id: string; messageId: string }>(async (req, { params }) => {
  const p = await params;
  return deleteForSelf(await requireActor(req), idParam(p.id), idParam(p.messageId));
});
