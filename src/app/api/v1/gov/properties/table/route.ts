import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminPropertiesQuery } from "@/modules/admin/properties/service";
import { govPropertyList } from "@/modules/gov/properties.service";

/** Government Admin: the All Properties table (tab filter + cursor paging for View More). */
export const GET = route(async (req) => govPropertyList(await requireActor(req), parseQuery(req, adminPropertiesQuery)));
