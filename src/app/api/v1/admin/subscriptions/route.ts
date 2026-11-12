import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { subListQuery, subscriptionList } from "@/modules/admin/subscriptions/service";

/** Super Admin: every owner with their newest plan (package and status filters, owner ID search, page number). */
export const GET = route(async (req) => subscriptionList(await requireActor(req), parseQuery(req, subListQuery)));
