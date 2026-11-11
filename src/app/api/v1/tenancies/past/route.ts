import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listPastTenants } from "@/modules/tenancy/past.service";
import { pastTenantsQuery } from "@/modules/tenancy/schema";

/** Previous Tenants of the signed-in owner: search, property and behaviour filters, page numbers. */
export const GET = route(async (req) => listPastTenants(await requireActor(req), parseQuery(req, pastTenantsQuery)));
