import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { eligibility } from "@/modules/marketplace/listings.service";

/** "Create Listing" guard. 403 LISTING_ENTITLEMENT_REQUIRED → client goes to /pricing?reason=listing and shows the toast. */
export const GET = route(async (req) => eligibility(await requireActor(req)));
