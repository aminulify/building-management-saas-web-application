import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { archiveStats } from "@/modules/admin/previous-properties/service";

export const GET = route(async (req) => archiveStats(await requireActor(req)));
