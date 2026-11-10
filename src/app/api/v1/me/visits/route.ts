import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { myVisits } from "@/modules/marketplace/visits.service";
import { visitListQuery } from "@/modules/marketplace/schema";

/** My visit requests (as=seeker, default) or the requests for my listings (as=seller). */
export const GET = route(async (req) => myVisits(await requireActor(req), parseQuery(req, visitListQuery)));
