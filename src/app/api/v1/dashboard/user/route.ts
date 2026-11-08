import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { userDashboard } from "@/modules/dashboards/user";

/** Free (general user) account dashboard. */
export const GET = route(async (req) => userDashboard(await requireActor(req)));
