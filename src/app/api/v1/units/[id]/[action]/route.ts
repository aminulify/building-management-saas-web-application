import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { archiveUnit, markAvailable } from "@/modules/properties/units.service";

/** POST /units/:id/{archive|mark-available} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (action === "archive") return archiveUnit(actor, idParam(id), req);
  if (action === "mark-available") return markAvailable(actor, idParam(id), req);
  throw new AppError("NOT_FOUND");
});
