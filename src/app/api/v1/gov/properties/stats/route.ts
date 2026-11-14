import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { govPropertyStats } from "@/modules/gov/properties.service";

/** Government Admin: the numbers on top of All Properties. */
export const GET = route(async (req) => govPropertyStats(await requireActor(req)));
