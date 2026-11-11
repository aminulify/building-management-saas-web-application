import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerOverview } from "@/modules/users/owner-overview.service";

/** Owner Profile page: profile, completion, portfolio numbers, properties, document states. */
export const GET = route(async (req) => ownerOverview(await requireActor(req)));
