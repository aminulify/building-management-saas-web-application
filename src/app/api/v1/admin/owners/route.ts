import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { directoryQuery, listOwners } from "@/modules/directory/service";

export const GET = route(async (req) => listOwners(await requireActor(req), parseQuery(req, directoryQuery), parseQuery(req, pageQuery)));
