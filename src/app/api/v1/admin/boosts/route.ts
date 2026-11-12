import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { boostListQuery } from "@/modules/boost/rules";
import { boostList } from "@/modules/boost/admin.service";

/** Paid Boost table: status tab, search, cursor paging. */
export const GET = route(async (req) => boostList(await requireActor(req), parseQuery(req, boostListQuery)));
