import { route, parseQuery } from "@/lib/api/handler";
import { listUpazilas } from "@/modules/geo/service";
import { upazilasQuery } from "@/modules/geo/schema";

export const GET = route(async (req) => listUpazilas(parseQuery(req, upazilasQuery).district));
