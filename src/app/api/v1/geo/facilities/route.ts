import { route, parseQuery } from "@/lib/api/handler";
import { facilitiesQuery, listFacilities } from "@/modules/geo/facilities.service";

/** Public: nearby-facility points for the map (mosque, school, hospital…). */
export const GET = route(async (req) => listFacilities(parseQuery(req, facilitiesQuery)));
