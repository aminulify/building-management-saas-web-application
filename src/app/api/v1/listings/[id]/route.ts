import { route, parseBody } from "@/lib/api/handler";
import { optionalActor, requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { deleteListing, updateListing } from "@/modules/marketplace/listings.service";
import { getListing } from "@/modules/marketplace/search.service";
import { listingUpdateSchema } from "@/modules/marketplace/schema";

export const GET = route<{ id: string }>(async (req, { params }) => getListing(await optionalActor(req), idParam((await params).id)));

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return updateListing(actor, idParam((await params).id), await parseBody(req, listingUpdateSchema), req);
});

/** Seller removes their listing: drafts are deleted for real, anything that was live or discussed is archived. */
export const DELETE = route<{ id: string }>(async (req, { params }) => deleteListing(await requireActor(req), idParam((await params).id), req));
