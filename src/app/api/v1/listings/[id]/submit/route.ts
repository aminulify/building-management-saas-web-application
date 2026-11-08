import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { submitListing } from "@/modules/marketplace/listings.service";

export const POST = route<{ id: string }>(async (req, { params }) => submitListing(await requireActor(req), idParam((await params).id), req));
