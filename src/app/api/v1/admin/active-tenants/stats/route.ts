import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantsStats } from "@/modules/admin/tenants/service";

export const GET = route(async (req) => tenantsStats(await requireActor(req)));
