import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { archiveList, archiveListQuery } from "@/modules/admin/previous-tenants/service";

/** Super Admin: Previous Tenants with reason, rent status, search and page number. */
export const GET = route(async (req) => archiveList(await requireActor(req), parseQuery(req, archiveListQuery)));
