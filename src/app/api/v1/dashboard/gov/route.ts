import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { govDashboard } from "@/modules/dashboards/gov";

export const GET = route(async (req) => govDashboard(await requireActor(req)));
