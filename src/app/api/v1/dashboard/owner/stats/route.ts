import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerStats } from "@/modules/dashboards/owner";

export const GET = route(async (req) => ownerStats(await requireActor(req)));
