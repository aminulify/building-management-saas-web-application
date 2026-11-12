import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminRangeQuery } from "@/modules/dashboards/admin-range";
import { maintenanceStats } from "@/modules/admin/maintenance/service";

export const GET = route(async (req) => maintenanceStats(await requireActor(req), parseQuery(req, adminRangeQuery)));
