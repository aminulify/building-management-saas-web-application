import { route, parseQuery } from "@/lib/api/handler";
import { estimateFee } from "@/modules/billing/quote.service";
import { feeEstimateQuery } from "@/modules/billing/upgrade-schema";

/** Public calculator: how much is the monthly landlord fee for N properties? */
export const GET = route(async (req) => {
  const q = parseQuery(req, feeEstimateQuery);
  return estimateFee(q.properties, q.cycle);
});
