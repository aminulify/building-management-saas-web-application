import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { activePlans, activePlansQuery } from "@/modules/dashboards/admin-overview.service";

export const GET = route(async (req) => activePlans(await requireActor(req), parseQuery(req, activePlansQuery)));
