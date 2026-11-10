import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerReport } from "@/modules/rent/ledger.service";
import { reportQuery } from "@/modules/rent/schema";

/** All rows + summary for the "Export Report" PDF, with the same filters as the screen. */
export const GET = route(async (req) => ownerReport(await requireActor(req), parseQuery(req, reportQuery)));
