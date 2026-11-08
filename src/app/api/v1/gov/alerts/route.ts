import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listAlerts } from "@/modules/emergency/response.service";
import { alertListQuery } from "@/modules/emergency/schema";

/** Quick Alert hub feed. Clients also poll this every 15 s with ?since= as a socket backstop. */
export const GET = route(async (req) => listAlerts(await requireActor(req), parseQuery(req, alertListQuery)));
