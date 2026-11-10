import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { lookupTenant } from "@/modules/tenancy/service";
import { tenantLookupQuery } from "@/modules/tenancy/schema";

export const GET = route(async (req) => lookupTenant(await requireActor(req), parseQuery(req, tenantLookupQuery)));
