import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { reportPlans } from "@/modules/dashboards/admin-report.service";

export const GET = route(async (req) => reportPlans(await requireActor(req)));
