import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantActivity } from "@/modules/dashboards/tenant";

const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(5) });

/** Recent Activity of the signed-in tenant: payments, repairs, incident reports and emergencies, newest first. */
export const GET = route(async (req) => tenantActivity(await requireActor(req), parseQuery(req, query).limit));
