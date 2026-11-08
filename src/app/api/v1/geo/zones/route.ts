import { route, parseQuery } from "@/lib/api/handler";
import { listZones } from "@/modules/geo/service";
import { zonesQuery } from "@/modules/geo/schema";

export const GET = route(async (req) => {
  const { q, upazila } = parseQuery(req, zonesQuery);
  return listZones(q, upazila);
});
