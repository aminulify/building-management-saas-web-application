import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantDirectory } from "@/modules/tenancy/directory.service";
import { tenantDirectoryQuery } from "@/modules/tenancy/schema";

/** Tenants Directory of the signed-in owner: tabs (all / leave soon / overdue), search, page numbers, headline stats. */
export const GET = route(async (req) => tenantDirectory(await requireActor(req), parseQuery(req, tenantDirectoryQuery)));
