import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminRangeQuery } from "@/modules/dashboards/admin-range";
import { ownersModeQuery, ownersStats } from "@/modules/admin/owners/service";

export const GET = route(async (req) => ownersStats(await requireActor(req), { ...parseQuery(req, adminRangeQuery), ...parseQuery(req, ownersModeQuery) }));
