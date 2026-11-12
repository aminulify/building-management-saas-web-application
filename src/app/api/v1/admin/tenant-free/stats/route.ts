import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { freeStats } from "@/modules/admin/tenant-free/service";

export const GET = route(async (req) => freeStats(await requireActor(req)));
