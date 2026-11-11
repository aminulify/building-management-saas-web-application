import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { actOnLiveCall } from "@/modules/messaging/live-calls.service";
import { CALL_LIVE_ACTIONS, type CallLiveAction } from "@/modules/messaging/schema";

/** accept / reject (callee) · end · missed (caller gave up or nobody answered). */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(CALL_LIVE_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  return actOnLiveCall(actor, idParam(id), action as CallLiveAction);
});
