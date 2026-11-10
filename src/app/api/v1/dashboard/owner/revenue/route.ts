import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerRevenue } from "@/modules/dashboards/owner";

const query = z.object({ year: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getUTCFullYear()) });

export const GET = route(async (req) => ownerRevenue(await requireActor(req), parseQuery(req, query).year));
