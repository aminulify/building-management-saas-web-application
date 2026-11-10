import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { deleteListingImage } from "@/modules/marketplace/listings.service";

/** Seller removes one photo of their listing. */
export const DELETE = route<{ id: string; imageId: string }>(async (req, { params }) => {
  const { id, imageId } = await params;
  return deleteListingImage(await requireActor(req), idParam(id), idParam(imageId));
});
