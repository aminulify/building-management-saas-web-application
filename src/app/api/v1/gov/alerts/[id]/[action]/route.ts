import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { act } from "@/modules/emergency/response.service";
import { ALERT_ACTIONS, alertActionSchema, type AlertActionName } from "@/modules/emergency/schema";

/** POST /gov/alerts/:id/{ack|assign|forward|status|notes} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(ALERT_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  const body = await parseBody(req, alertActionSchema).catch(() => ({}));
  return act(actor, idParam(id), action as AlertActionName, body, req);
});
