import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listTenancies } from "@/modules/tenancy/service";
import { tenancyListQuery } from "@/modules/tenancy/schema";

export const GET = route(async (req) => listTenancies(await requireActor(req), parseQuery(req, tenancyListQuery)));
