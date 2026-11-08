import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { actOnCall } from "@/modules/messaging/calls.service";
import { CALL_ACTIONS, type CallAction } from "@/modules/messaging/schema";

/** POST /call-requests/:id/{accept|decline|cancel|done} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(CALL_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  return actOnCall(actor, idParam(id), action as CallAction);
});
