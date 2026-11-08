import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { csvResponse } from "@/lib/csv";
import { exportPayments, paymentsQuery } from "@/modules/admin/broadcast-payments.service";

export const GET = route(async (req) => csvResponse("payments.csv", await exportPayments(await requireActor(req), parseQuery(req, paymentsQuery), req)));
