import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { listNotifications } from "@/modules/notifications/service";

export const GET = route(async (req) => listNotifications(await requireActor(req), parseQuery(req, pageQuery)));
