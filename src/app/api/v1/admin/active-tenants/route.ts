import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantsList, tenantsListQuery } from "@/modules/admin/tenants/service";

/** Super Admin: tenants with a running lease (All / Active / Notice Given tab, search, page number). */
export const GET = route(async (req) => tenantsList(await requireActor(req), parseQuery(req, tenantsListQuery)));
