import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { mySubscription } from "@/modules/billing/subscription.service";

export const GET = route(async (req) => mySubscription(await requireActor(req)));
