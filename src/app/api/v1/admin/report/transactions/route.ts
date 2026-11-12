import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { reportTransactions, transactionsQuery } from "@/modules/dashboards/admin-report.service";

export const GET = route(async (req) => reportTransactions(await requireActor(req), parseQuery(req, transactionsQuery)));
