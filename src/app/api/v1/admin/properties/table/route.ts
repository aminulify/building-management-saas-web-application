import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminPropertiesQuery, listAdminProperties } from "@/modules/admin/properties/service";

/** The Super Admin's All Properties table: tab filter + cursor paging. */
export const GET = route(async (req) => listAdminProperties(await requireActor(req), parseQuery(req, adminPropertiesQuery)));
