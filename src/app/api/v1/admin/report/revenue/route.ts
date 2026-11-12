import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { reportRevenue, revenueQuery } from "@/modules/dashboards/admin-report.service";

export const GET = route(async (req) => reportRevenue(await requireActor(req), parseQuery(req, revenueQuery)));
