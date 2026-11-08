import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerOverview } from "@/modules/rent/service";
import { monthStart } from "@/modules/rent/billing";
import { overviewQuery } from "@/modules/rent/schema";

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  const { month } = parseQuery(req, overviewQuery);
  return ownerOverview(actor, month ? monthStart(month) : monthStart());
});
