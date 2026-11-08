import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listRecords } from "@/modules/rent/service";
import { recordsQuery } from "@/modules/rent/schema";

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  const q = parseQuery(req, recordsQuery);
  return listRecords(actor, q.agreementId, q.status);
});
