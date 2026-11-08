import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminDashboard } from "@/modules/dashboards/admin";

export const GET = route(async (req) => adminDashboard(await requireActor(req)));
