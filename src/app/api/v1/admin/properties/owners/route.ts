import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerChoices } from "@/modules/admin/properties/service";

export const GET = route(async (req) => ownerChoices(await requireActor(req), parseQuery(req, z.object({ q: z.string().trim().max(60).optional() })).q));
