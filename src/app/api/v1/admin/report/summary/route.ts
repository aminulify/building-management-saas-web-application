import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminRangeQuery } from "@/modules/dashboards/admin-range";
import { reportSummary } from "@/modules/dashboards/admin-report.service";

export const GET = route(async (req) => reportSummary(await requireActor(req), parseQuery(req, adminRangeQuery)));
