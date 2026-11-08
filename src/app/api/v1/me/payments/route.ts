import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { myPayments } from "@/modules/billing/subscription.service";

export const GET = route(async (req) => myPayments(await requireActor(req)));
