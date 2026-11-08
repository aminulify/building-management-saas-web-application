import { route, parseBody } from "@/lib/api/handler";
import { optionalActor, requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { updateListing } from "@/modules/marketplace/listings.service";
import { getListing } from "@/modules/marketplace/search.service";
import { listingUpdateSchema } from "@/modules/marketplace/schema";

export const GET = route<{ id: string }>(async (req, { params }) => getListing(await optionalActor(req), idParam((await params).id)));

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return updateListing(actor, idParam((await params).id), await parseBody(req, listingUpdateSchema), req);
});
