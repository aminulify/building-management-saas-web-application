import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { stats } from "@/modules/maintenance/service";

export const GET = route(async (req) => stats(await requireActor(req)));
