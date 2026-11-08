import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { ownerAction } from "@/modules/marketplace/listings.service";
import { LISTING_ACTIONS, type ListingAction } from "@/modules/marketplace/schema";

/** POST /listings/:id/{renew|mark-sold|mark-rented|deactivate|archive} (seller only) */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const { id, action } = await params;
  if (!(LISTING_ACTIONS as readonly string[]).includes(action)) throw new AppError("NOT_FOUND");
  return ownerAction(actor, idParam(id), action as ListingAction, req);
});
