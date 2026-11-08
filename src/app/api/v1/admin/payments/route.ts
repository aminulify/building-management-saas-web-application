import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { listPayments, paymentsQuery } from "@/modules/admin/broadcast-payments.service";

export const GET = route(async (req) => listPayments(await requireActor(req), parseQuery(req, paymentsQuery), parseQuery(req, pageQuery)));
