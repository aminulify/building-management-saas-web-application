import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { buildQuote } from "@/modules/billing/quote.service";
import { quoteSchema } from "@/modules/billing/upgrade-schema";

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { planId, cycle } = await parseBody(req, quoteSchema);
  return buildQuote(actor, planId, cycle);
});
