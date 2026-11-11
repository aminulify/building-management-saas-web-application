import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminPropertyStats } from "@/modules/admin/properties/service";

export const GET = route(async (req) => adminPropertyStats(await requireActor(req)));
