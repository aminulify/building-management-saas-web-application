import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantDashboard } from "@/modules/dashboards/tenant";

export const GET = route(async (req) => tenantDashboard(await requireActor(req)));
