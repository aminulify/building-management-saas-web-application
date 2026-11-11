import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantFeed, tenantFeedQuery } from "@/modules/notifications/tenant-center.service";

/** Tenant "Your Activity": the notification feed (tab, 10 per page) with the live state of each card. */
export const GET = route(async (req) => tenantFeed(await requireActor(req), parseQuery(req, tenantFeedQuery)));
