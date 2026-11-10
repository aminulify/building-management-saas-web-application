import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerActivities } from "@/modules/dashboards/owner";

const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(8) });

export const GET = route(async (req) => ownerActivities(await requireActor(req), parseQuery(req, query).limit));
