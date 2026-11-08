import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { markAllRead } from "@/modules/notifications/service";

export const POST = route(async (req) => markAllRead(await requireActor(req)));
