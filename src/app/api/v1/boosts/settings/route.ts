import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { boostSettingsForOwner } from "@/modules/boost/service";

/** Fee, duration and the bKash number the seller pays to. */
export const GET = route(async (req) => boostSettingsForOwner(await requireActor(req)));
