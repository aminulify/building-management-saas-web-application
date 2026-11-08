import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { transition } from "@/modules/maintenance/service";
import { ACTIONS, actionBodySchema, type MaintenanceAction } from "@/modules/maintenance/schema";

/** POST /maintenance/:id/{approve|reject|assign|status|complete|cancel} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  const body = await parseBody(req, actionBodySchema).catch(() => ({}));
  return transition(actor, idParam(id), action as MaintenanceAction, body, req);
});
