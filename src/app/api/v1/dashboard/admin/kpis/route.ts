import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminRangeQuery } from "@/modules/dashboards/admin-range";
import { adminKpis } from "@/modules/dashboards/admin-overview.service";

export const GET = route(async (req) => adminKpis(await requireActor(req), parseQuery(req, adminRangeQuery)));
