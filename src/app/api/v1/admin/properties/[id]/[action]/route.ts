import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { REVIEW_ACTIONS, review, reviewSchema, type ReviewAction } from "@/modules/directory/property-review.service";

/** POST /admin/properties/:id/{verify|reject|request-docs|suspend|restore} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(REVIEW_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  const body = await parseBody(req, reviewSchema).catch(() => ({ notes: undefined }));
  return review(actor, idParam(id), action as ReviewAction, body.notes, req);
});
