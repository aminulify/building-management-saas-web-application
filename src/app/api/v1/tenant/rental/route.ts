import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { myRental } from "@/modules/tenancy/agreement.service";

/** Tenant "My Rental" page. */
export const GET = route(async (req) => myRental(await requireActor(req)));
