import { route, parseQuery } from "@/lib/api/handler";
import { checkAvailability } from "@/modules/auth/availability";
import { availabilityQuery } from "@/modules/auth/schema";

export const GET = route(async (req) => checkAvailability(parseQuery(req, availabilityQuery), req));
