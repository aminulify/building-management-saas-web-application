import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { moderate } from "@/modules/marketplace/moderation.service";
import { MOD_ACTIONS, modBodySchema, type ModAction } from "@/modules/marketplace/schema";

/** POST /admin/listings/:id/{approve|reject|suspend|restore|feature|unfeature|flag}. Gov Admin: flag only. */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(MOD_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  const body = await parseBody(req, modBodySchema).catch(() => ({}));
  return moderate(actor, idParam(id), action as ModAction, body, req);
});
