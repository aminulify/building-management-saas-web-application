import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { paymentsListQuery, tenantPayments } from "@/modules/rent/extras.service";

/** Tenant Payment History (own payments only). */
export const GET = route(async (req) => tenantPayments(await requireActor(req), parseQuery(req, paymentsListQuery), parseQuery(req, pageQuery)));
