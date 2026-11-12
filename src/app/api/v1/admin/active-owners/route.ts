import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownersList, ownersListQuery } from "@/modules/admin/owners/service";

/** Super Admin: active owners (rental portfolio or marketplace seller view), plan tab, search, page number. */
export const GET = route(async (req) => ownersList(await requireActor(req), parseQuery(req, ownersListQuery)));
