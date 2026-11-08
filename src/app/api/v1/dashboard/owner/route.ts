import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerDashboard } from "@/modules/dashboards/owner";

export const GET = route(async (req) => ownerDashboard(await requireActor(req)));
