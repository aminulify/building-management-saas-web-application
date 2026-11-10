import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listOwnerUnits } from "@/modules/properties/units.service";
import { ownerUnitsQuery } from "@/modules/properties/schema";

/** Every unit of the signed-in owner, with filters and page numbers (Units Management page). */
export const GET = route(async (req) => listOwnerUnits(await requireActor(req), parseQuery(req, ownerUnitsQuery)));
