import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { platformAnalytics, rangeQuery } from "@/modules/admin/analytics.service";

export const GET = route(async (req) => platformAnalytics(await requireActor(req), parseQuery(req, rangeQuery)));
