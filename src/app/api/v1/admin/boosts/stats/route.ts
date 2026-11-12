import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { boostStats } from "@/modules/boost/admin.service";

export const GET = route(async (req) => boostStats(await requireActor(req)));
