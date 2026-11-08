import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { ownerPayments, paymentsListQuery } from "@/modules/rent/extras.service";

/** Owner Payment History. */
export const GET = route(async (req) => ownerPayments(await requireActor(req), parseQuery(req, paymentsListQuery), parseQuery(req, pageQuery)));
