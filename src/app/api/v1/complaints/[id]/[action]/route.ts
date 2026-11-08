import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { act } from "@/modules/complaints/service";
import { COMPLAINT_ACTIONS, complaintActionSchema, type ComplaintAction } from "@/modules/complaints/schema";

/** POST /complaints/:id/{assign|status|notes|resolve|reopen} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(COMPLAINT_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  const body = await parseBody(req, complaintActionSchema).catch(() => ({}));
  return act(actor, idParam(id), action as ComplaintAction, body, req);
});
