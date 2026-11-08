import { route, parseQuery } from "@/lib/api/handler";
import { listDistricts } from "@/modules/geo/service";
import { districtsQuery } from "@/modules/geo/schema";

export const GET = route(async (req) => listDistricts(parseQuery(req, districtsQuery).division));
