import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantHistory } from "@/modules/rent/history.service";

/** Tenant "Rental & Payment History": all stays, the numbers on top and the latest rent rows. */
export const GET = route(async (req) => tenantHistory(await requireActor(req)));
