import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminRangeQuery } from "@/modules/dashboards/admin-range";
import { reportBreakdown } from "@/modules/dashboards/admin-report.service";

/** Numbers for the "Export Invoice" PDF of the chosen dates. */
export const GET = route(async (req) => reportBreakdown(await requireActor(req), parseQuery(req, adminRangeQuery)));
