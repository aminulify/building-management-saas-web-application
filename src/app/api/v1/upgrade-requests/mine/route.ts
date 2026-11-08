import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { myRequests } from "@/modules/billing/upgrade.service";

export const GET = route(async (req) => myRequests(await requireActor(req)));
