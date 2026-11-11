import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { homeStats, homeStatsQuery } from "@/modules/admin/manage-home/service";

export const GET = route(async (req) => homeStats(await requireActor(req), parseQuery(req, homeStatsQuery)));
