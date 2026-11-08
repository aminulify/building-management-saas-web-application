import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listForReview } from "@/modules/billing/upgrade.service";
import { upgradeListQuery } from "@/modules/billing/upgrade-schema";

export const GET = route(async (req) => listForReview(await requireActor(req), parseQuery(req, upgradeListQuery).status));
