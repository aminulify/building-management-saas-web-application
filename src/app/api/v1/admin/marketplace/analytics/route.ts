import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { marketplaceAnalytics, rangeQuery } from "@/modules/admin/analytics.service";

export const GET = route(async (req) => marketplaceAnalytics(await requireActor(req), parseQuery(req, rangeQuery)));
