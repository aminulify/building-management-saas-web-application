import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { archiveList, archiveListQuery } from "@/modules/admin/previous-properties/service";

/** Super Admin: Previous Properties (archived, suspended, inactive, deleted) with status, reason, search and page number. */
export const GET = route(async (req) => archiveList(await requireActor(req), parseQuery(req, archiveListQuery)));
