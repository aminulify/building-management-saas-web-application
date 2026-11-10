import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerLedger } from "@/modules/rent/ledger.service";
import { ledgerQuery } from "@/modules/rent/schema";

/** Rent Overview (owner): stats for the month/property + one page of the payment history. */
export const GET = route(async (req) => ownerLedger(await requireActor(req), parseQuery(req, ledgerQuery)));
