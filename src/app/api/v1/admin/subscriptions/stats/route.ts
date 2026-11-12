import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { subscriptionStats } from "@/modules/admin/subscriptions/service";

export const GET = route(async (req) => subscriptionStats(await requireActor(req)));
