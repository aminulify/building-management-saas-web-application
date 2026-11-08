import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { csvResponse } from "@/lib/csv";
import { analyticsCsv, rangeQuery } from "@/modules/admin/analytics.service";

export const GET = route(async (req) => csvResponse("analytics.csv", await analyticsCsv(await requireActor(req), parseQuery(req, rangeQuery))));
