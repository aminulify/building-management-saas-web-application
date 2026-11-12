import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { maintenanceList, maintenanceListQuery } from "@/modules/admin/maintenance/service";

/** Super Admin: all maintenance requests (status, priority, category, REQ number / property / person search, cursor paging). */
export const GET = route(async (req) => maintenanceList(await requireActor(req), parseQuery(req, maintenanceListQuery)));
