import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { heartbeat, presenceOf } from "@/modules/messaging/presence.service";
import { presenceQuery } from "@/modules/messaging/schema";

/** POST = heartbeat ("I'm online"), GET ?userIds=a,b = online/offline + lastSeenAt. */
export const POST = route(async (req) => heartbeat(await requireActor(req)));

export const GET = route(async (req) => presenceOf(await requireActor(req), parseQuery(req, presenceQuery).userIds));
