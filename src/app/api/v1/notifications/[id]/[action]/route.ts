import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { archive, markRead } from "@/modules/notifications/service";

/** POST /notifications/:id/{read|archive} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (action === "read") return markRead(actor, idParam(id));
  if (action === "archive") return archive(actor, idParam(id));
  throw new AppError("NOT_FOUND");
});
