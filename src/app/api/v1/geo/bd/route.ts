import { route, parseQuery } from "@/lib/api/handler";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { bdGeo } from "@/modules/marketplace/geo-bd.service";
import { geoBdQuery } from "@/modules/marketplace/schema";

/** Division → district → upazila → union lists from the Bangladesh open geo API, cached for a day. */
export const GET = route(async (req) => {
  rateLimit(`geo-bd:${clientIp(req)}`, 120, 60_000);
  const q = parseQuery(req, geoBdQuery);
  return bdGeo(q.level, q.parent);
});
